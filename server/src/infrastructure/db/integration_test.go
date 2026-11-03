package db_test

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"nightlog/server/src/audit"
	"nightlog/server/src/config"
	"nightlog/server/src/infrastructure/db"
	"nightlog/server/src/infrastructure/db/testkit"
	"nightlog/server/src/models/dto"
	"nightlog/server/src/models/vo"
	"nightlog/server/src/models/vo/common"
	"nightlog/server/src/router"
	"nightlog/server/src/service"
	"reflect"
	"strings"
	"testing"
	"time"
)

type client struct {
	t       *testing.T
	handler http.Handler
	cookies map[string]*http.Cookie
}
type result struct {
	Code      string          `json:"code"`
	Data      json.RawMessage `json:"data"`
	Message   string          `json:"message"`
	RequestID string          `json:"request_id"`
}

func (c *client) req(method, path string, body any, expected int) result {
	c.t.Helper()
	var token string
	if method != "GET" {
		r := c.req("GET", "/v1/api/auth/csrf", nil, 200)
		var data struct {
			Token string `json:"token"`
		}
		_ = json.Unmarshal(r.Data, &data)
		token = data.Token
	}
	var payload []byte
	if body != nil {
		payload, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.RemoteAddr = "203.0.113.8:1234"
	// A direct API caller cannot override its peer address.
	req.Header.Set("X-Forwarded-For", "198.51.100.99")
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("X-CSRF-Token", token)
	}
	for _, cookie := range c.cookies {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	c.handler.ServeHTTP(rec, req)
	for _, cookie := range rec.Result().Cookies() {
		if cookie.MaxAge < 0 {
			delete(c.cookies, cookie.Name)
		} else {
			c.cookies[cookie.Name] = cookie
		}
	}
	var out result
	if e := json.Unmarshal(rec.Body.Bytes(), &out); e != nil {
		c.t.Fatalf("invalid response %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Code != expected {
		c.t.Fatalf("%s %s: got %d want %d (%s)", method, path, rec.Code, expected, rec.Body.String())
	}
	if out.RequestID == "" {
		c.t.Fatal("missing request_id")
	}
	return out
}
func decode[T any](t *testing.T, r result) T {
	t.Helper()
	var out T
	if e := json.Unmarshal(r.Data, &out); e != nil {
		t.Fatal(e)
	}
	return out
}

var integrationConfig = flag.String("integration-config", "", "YAML configuration for real PostgreSQL integration tests")

func TestDeploymentBootstrapPreservesExistingAdministrator(t *testing.T) {
	if *integrationConfig == "" {
		t.Skip("requires -integration-config")
	}
	cfg, err := config.LoadFile(*integrationConfig)
	if err != nil {
		t.Fatal(err)
	}
	sandbox, err := testkit.New(cfg.DSN)
	if err != nil {
		t.Fatal(err)
	}
	defer sandbox.Close()
	database, err := db.Open(sandbox.DSN)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err = database.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	app := service.New(database)
	ctx := context.Background()
	in := dto.Credentials{Username: "owner", Password: "FirstStrongPassword2026!"}
	created, err := app.BootstrapAdmin(ctx, in)
	if err != nil || !created {
		t.Fatalf("initial administrator: created=%v err=%v", created, err)
	}
	in.Password = "DifferentStrongPassword2026!"
	created, err = app.BootstrapAdmin(ctx, in)
	if err != nil || created {
		t.Fatalf("repeat must preserve existing administrator: created=%v err=%v", created, err)
	}
	if _, _, err = app.Login(ctx, dto.Credentials{Username: "owner", Password: "FirstStrongPassword2026!"}); err != nil {
		t.Fatal("bootstrap reset existing password")
	}
	_, err = app.BootstrapAdmin(ctx, dto.Credentials{Username: "another_owner", Password: in.Password})
	if err == nil {
		t.Fatal("changed owner identity must be rejected")
	}
}

func TestBlogIntegration(t *testing.T) {
	if *integrationConfig == "" {
		t.Skip("pass -args -integration-config /path/to/config.yaml for real PostgreSQL integration tests")
	}
	cfg, err := config.LoadFile(*integrationConfig)
	if err != nil {
		t.Fatal(err)
	}
	dsn := cfg.DSN
	sandbox, e := testkit.New(dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer sandbox.Close()
	database, e := db.Open(sandbox.DSN)
	if e != nil {
		t.Fatal(e)
	}
	defer database.Close()
	if e = database.Migrate(context.Background()); e != nil {
		t.Fatal(e)
	}
	if e = database.Migrate(context.Background()); e != nil {
		t.Fatal("idempotent migration failed:", e)
	}
	app := service.New(database)
	ctx := audit.With(context.Background(), audit.Meta{RequestID: audit.ID()})
	admin, e := app.Register(ctx, dto.Credentials{Username: "owner", DisplayName: "博主", Password: "TestPassword2026!"}, true)
	if e != nil {
		t.Fatal(e)
	}
	_ = admin
	handler := router.New(app, config.Config{Origin: "http://localhost:3000", AuditKey: strings.Repeat("a", 64), Storage: t.TempDir()})
	owner := &client{t, handler, map[string]*http.Cookie{}}
	reader := &client{t, handler, map[string]*http.Cookie{}}
	visitor := &client{t, handler, map[string]*http.Cookie{}}
	owner.req("POST", "/v1/api/auth/login", dto.Credentials{Username: "owner", Password: "TestPassword2026!"}, 200)
	reader.req("POST", "/v1/api/auth/register", dto.Credentials{Username: "reader", Password: "ReaderPassword2026!"}, 201)
	reader.req("POST", "/v1/api/auth/login", dto.Credentials{Username: "reader", Password: "ReaderPassword2026!"}, 200)
	reader.req("GET", "/v1/api/admin/posts", nil, 403)
	visitor.req("GET", "/v1/api/me", nil, 401)
	newPost := decode[map[string]string](t, owner.req("POST", "/v1/api/admin/posts", nil, 201))
	id := newPost["id"]
	draft := decode[vo.Draft](t, owner.req("GET", "/v1/api/admin/posts/"+id+"/draft", nil, 200))
	data := dto.Draft{Title: "第一篇文章", Slug: "first-post", Markdown: "## 标题\n\n公开正文", Category: "技术", Tags: []string{"Go"}, Version: draft.Version, PostVersion: draft.PostVersion}
	owner.req("PATCH", "/v1/api/admin/posts/"+id+"/draft", data, 200)
	visitor.req("GET", "/v1/api/posts/first-post", nil, 404)
	owner.req("PATCH", "/v1/api/admin/posts/"+id+"/draft", data, 409)
	draft = decode[vo.Draft](t, owner.req("GET", "/v1/api/admin/posts/"+id+"/draft", nil, 200))
	if e = sandbox.RejectPublishAudit(); e != nil {
		t.Fatal(e)
	}
	var operationLogs bytes.Buffer
	previousLog := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&operationLogs, nil)))
	defer slog.SetDefault(previousLog)
	owner.req("POST", "/v1/api/admin/posts/"+id+"/publish", dto.Publish{Version: draft.Version, PostVersion: draft.PostVersion}, 500)
	if strings.Contains(operationLogs.String(), `"msg":"operation_committed"`) {
		t.Fatal("rolled-back publish was logged as committed")
	}
	visitor.req("GET", "/v1/api/posts/first-post", nil, 404)
	if e = sandbox.AllowPublishAudit(); e != nil {
		t.Fatal(e)
	}
	owner.req("POST", "/v1/api/admin/posts/"+id+"/publish", dto.Publish{Version: draft.Version, PostVersion: draft.PostVersion}, 200)
	if !strings.Contains(operationLogs.String(), `"event_type":"post.publish"`) {
		t.Fatal("committed publish has no business log")
	}
	slog.SetDefault(previousLog)
	post := decode[vo.Post](t, visitor.req("GET", "/v1/api/posts/first-post", nil, 200))
	if post.Markdown != "## 标题\n\n公开正文" {
		t.Fatal("wrong published body")
	}
	draft = decode[vo.Draft](t, owner.req("GET", "/v1/api/admin/posts/"+id+"/draft", nil, 200))
	data.Version = draft.Version
	data.PostVersion = draft.PostVersion
	data.Markdown = "私有修改"
	owner.req("PATCH", "/v1/api/admin/posts/"+id+"/draft", data, 200)
	post = decode[vo.Post](t, reader.req("GET", "/v1/api/posts/first-post", nil, 200))
	if strings.Contains(post.Markdown, "私有") {
		t.Fatal("draft leaked")
	}
	for i := 0; i < 2; i++ {
		reader.req("PUT", "/v1/api/posts/"+id+"/like", nil, 200)
	}
	reader.req("PUT", "/v1/api/posts/"+id+"/bookmark", nil, 200)
	reactions := decode[vo.Reactions](t, reader.req("GET", "/v1/api/me/posts/"+id+"/reactions", nil, 200))
	if !reactions.Liked || !reactions.Bookmarked {
		t.Fatal("reaction kinds did not coexist")
	}
	comment := decode[map[string]string](t, reader.req("POST", "/v1/api/posts/"+id+"/comments", dto.Comment{Body: "很喜欢这篇文章"}, 201))
	cid := comment["id"]
	owner.req("POST", "/v1/api/admin/comments/"+cid+"/replies", dto.Comment{Body: "谢谢你的阅读"}, 200)
	comments := visitor.req("GET", "/v1/api/posts/"+id+"/comments", nil, 200)
	if !bytes.Contains(comments.Data, []byte("谢谢你的阅读")) {
		t.Fatal("reply not visible")
	}
	reader.req("POST", "/v1/api/guestbook", dto.Comment{Body: "路过留下一句问候"}, 201)
	owner.req("POST", "/v1/api/admin/posts/"+id+"/unpublish", nil, 200)
	collection := reader.req("GET", "/v1/api/me/bookmarks", nil, 200)
	if bytes.Contains(collection.Data, []byte("第一篇文章")) || !bytes.Contains(collection.Data, []byte("unavailable")) {
		t.Fatal("unpublished content leaked in collections")
	}
	reader.req("DELETE", "/v1/api/posts/"+id+"/bookmark", nil, 200)
	site := decode[vo.Site](t, owner.req("GET", "/v1/api/site", nil, 200))
	site.Name = "林间手记"
	owner.req("PUT", "/v1/api/admin/settings", site, 200)
	updated := decode[vo.Site](t, visitor.req("GET", "/v1/api/site", nil, 200))
	if updated.Name != site.Name {
		t.Fatal("site config not saved")
	}
	reader.req("GET", "/v1/api/admin/audits", nil, 403)
	owner.req("GET", "/v1/api/admin/audits", nil, 200)
	for _, eventType := range []string{"auth.register", "auth.login"} {
		rows := decode[common.PageData[vo.Audit]](t, owner.req("GET", "/v1/api/admin/audits?username=reader&client_ip=203.0.113.8&event_type="+eventType, nil, 200))
		if rows.Pagination.Total != 1 || rows.List[0].Username != "reader" || rows.List[0].ClientIP != "203.0.113.8" || rows.List[0].ActorID == "" {
			t.Fatalf("missing authenticated audit identity: %+v", rows)
		}
	}
	makeEvent := func() dto.Event {
		return dto.Event{EventID: audit.ID(), VisitID: audit.ID(), PageViewID: audit.ID(), Seq: 1, EventType: "page_view", Path: "/v1/posts", OccurredAt: time.Now().UTC().Format(time.RFC3339)}
	}
	reader.req("POST", "/v1/api/events", map[string]any{"events": []dto.Event{makeEvent()}, "username": "forged", "client_ip": "198.51.100.99"}, 400)
	reader.req("POST", "/v1/api/events", dto.Events{Events: []dto.Event{makeEvent()}}, 200)
	visitor.req("POST", "/v1/api/events", dto.Events{Events: []dto.Event{makeEvent()}}, 200)
	views := decode[common.PageData[vo.Audit]](t, owner.req("GET", "/v1/api/admin/audits?event_type=page_view&client_ip=203.0.113.8", nil, 200))
	if views.Pagination.Total != 2 {
		t.Fatalf("wrong view count: %+v", views)
	}
	for _, v := range views.List {
		if v.ClientIP != "203.0.113.8" || (v.ActorID != "" && v.Username != "reader") || (v.ActorID == "" && v.Username != "") {
			t.Fatalf("spoofed or missing view identity: %+v", v)
		}
	}
	owner.req("GET", "/v1/api/admin/audits?client_ip=invalid", nil, 400)
	reader.req("GET", "/v1/api/posts?page=0", nil, 400)
	visitor.req("GET", "/not-versioned", nil, 404)
	reader.req("POST", "/v1/api/auth/logout", nil, 200)
	reader.req("GET", "/v1/api/me", nil, 401)
	names, e := sandbox.Tables()
	if e != nil {
		t.Fatal(e)
	}
	want := []string{"audit_logs", "comments", "drafts", "posts", "reactions", "users"}
	if !reflect.DeepEqual(names, want) {
		t.Fatal(fmt.Sprint("unexpected tables ", names))
	}
	// A missing CSRF header must not authorize a mutation, even with an authenticated cookie.
	request := httptest.NewRequest("POST", "/v1/api/admin/posts", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	for _, c := range owner.cookies {
		request.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, request)
	if rec.Code != 403 {
		t.Fatal("CSRF not enforced")
	}
}
