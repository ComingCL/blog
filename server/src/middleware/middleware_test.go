package middleware_test

import (
	"bytes"
	"encoding/json"
	"github.com/gin-gonic/gin"
	"log/slog"
	"net/http/httptest"
	"nightlog/server/src/audit"
	"nightlog/server/src/config"
	"nightlog/server/src/middleware"
	"nightlog/server/src/models/vo"
	"nightlog/server/src/service"
	"strings"
	"testing"
)

func TestAccessIdentityAndProxyTrust(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	defer slog.SetDefault(previous)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	_ = r.SetTrustedProxies([]string{"127.0.0.1", "::1"})
	r.RemoteIPHeaders = []string{"X-Forwarded-For"}
	r.Use(middleware.Base(service.New(nil), config.Config{AuditKey: strings.Repeat("x", 32)}))
	var seen audit.Meta
	r.GET("/v1/probe", func(c *gin.Context) {
		// Simulate successful authentication in a handler (e.g. login).
		middleware.SetUser(c, vo.User{ID: "user-123", Username: "reader", DisplayName: "读者"})
		seen = audit.From(c.Request.Context())
		c.Status(204)
	})
	for _, tc := range []struct{ peer, header, want string }{
		{"203.0.113.8:1234", "198.51.100.99", "203.0.113.8"},
		{"127.0.0.1:1234", "2001:db8::2", "2001:db8::2"},
		{"[::1]:1234", "::ffff:192.0.2.5", "192.0.2.5"},
	} {
		logs.Reset()
		req := httptest.NewRequest("GET", "/v1/probe?password=never-log", nil)
		req.RemoteAddr = tc.peer
		req.Header.Set("X-Forwarded-For", tc.header)
		req.Header.Set("X-Real-IP", "198.51.100.66")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != 204 || seen.ClientIP != tc.want || seen.Username != "reader" || seen.ActorID != "user-123" {
			t.Fatalf("wrong request identity: status=%d meta=%+v", rec.Code, seen)
		}
		var end map[string]any
		lines := bytes.Split(bytes.TrimSpace(logs.Bytes()), []byte("\n"))
		if len(lines) != 1 {
			t.Fatalf("want one completed access record, got %d", len(lines))
		}
		if err := json.Unmarshal(lines[len(lines)-1], &end); err != nil {
			t.Fatal(err)
		}
		if end["client_ip"] != tc.want || end["username"] != "reader" || end["user_id"] != "user-123" || end["status"] != float64(204) {
			t.Fatalf("missing access identity: %v", end)
		}
		if strings.Contains(logs.String(), "never-log") {
			t.Fatal("query string leaked into access log")
		}
	}
}

func TestHealthLoggingKeepsFailuresButSilencesSuccessfulProbes(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	defer slog.SetDefault(previous)
	r := gin.New()
	r.Use(middleware.Base(service.New(nil), config.Config{AuditKey: strings.Repeat("x", 32)}))
	r.GET("/v1/healthz", func(c *gin.Context) { c.Status(200) })
	r.GET("/v1/api/auth/csrf", func(c *gin.Context) { c.Status(200) })
	r.GET("/v1/uploads/:key", func(c *gin.Context) { c.Status(200) })
	r.GET("/v1/readyz", func(c *gin.Context) { c.Status(503) })
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/v1/healthz", nil))
	if logs.Len() != 0 {
		t.Fatal("successful health probes must not create access noise")
	}
	for _, path := range []string{"/v1/api/auth/csrf", "/v1/uploads/example.jpg"} {
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", path, nil))
		if logs.Len() != 0 {
			t.Fatalf("successful supporting request created access noise: %s", path)
		}
	}
	r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "/v1/readyz", nil))
	var entry map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(logs.Bytes()), &entry); err != nil {
		t.Fatal(err)
	}
	if entry["level"] != "ERROR" || entry["status"] != float64(503) {
		t.Fatalf("missing failed probe: %v", entry)
	}
}
