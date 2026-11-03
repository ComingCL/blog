package handler

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"io"
	"net/http"
	"net/netip"
	"nightlog/server/src/audit"
	"nightlog/server/src/config"
	"nightlog/server/src/infrastructure/db"
	"nightlog/server/src/middleware"
	"nightlog/server/src/models/dto"
	"nightlog/server/src/models/enums"
	"nightlog/server/src/models/vo"
	"nightlog/server/src/response"
	"nightlog/server/src/service"
	"nightlog/server/src/storage"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type Handler struct {
	App    *service.App
	Config config.Config
}

func Bind[T any](c *gin.Context) (T, error) {
	var v T
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(&v) != nil {
		return v, db.ErrInvalid
	}
	var extra any
	if e := decoder.Decode(&extra); e != io.EOF {
		return v, db.ErrInvalid
	}
	return v, nil
}
func Handle(fn func(*gin.Context) (any, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		v, e := fn(c)
		if e != nil {
			response.Error(c, e)
			return
		}
		response.OK(c, v)
	}
}
func Created(fn func(*gin.Context) (any, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		v, e := fn(c)
		if e != nil {
			response.Error(c, e)
			return
		}
		response.Created(c, v)
	}
}
func page(c *gin.Context) (dto.Page, error) {
	p, e := dto.ParsePage(c.Query("page"), c.Query("page_size"))
	if e != nil {
		return p, db.ErrInvalid
	}
	p.Q = c.Query("q")
	p.Status = enums.PostStatus(c.Query("status"))
	if p.Status != "" && !p.Status.Valid() {
		return p, db.ErrInvalid
	}
	p.Category = c.Query("category")
	p.Tag = c.Query("tag")
	p.Filter = enums.CommentFilter(c.Query("filter"))
	if !p.Filter.Valid() {
		return p, db.ErrInvalid
	}
	p.EventType = enums.AuditEvent(c.Query("event_type"))
	if p.EventType != "" && !p.EventType.Valid() {
		return p, db.ErrInvalid
	}
	p.ActorID = c.Query("actor_id")
	p.Username = strings.ToLower(strings.TrimSpace(c.Query("username")))
	p.ClientIP = strings.TrimSpace(c.Query("client_ip"))
	if len(p.Username) > 24 {
		return p, db.ErrInvalid
	}
	if p.ClientIP != "" {
		ip, err := netip.ParseAddr(p.ClientIP)
		if err != nil {
			return p, db.ErrInvalid
		}
		p.ClientIP = ip.Unmap().String()
	}
	p.VisitID = c.Query("visit_id")
	if len(p.Q) > 100 {
		return p, db.ErrInvalid
	}
	return p, nil
}
func (h *Handler) CSRF(c *gin.Context) (any, error) {
	return map[string]string{"token": middleware.CSRFToken(c, h.Config)}, nil
}
func (h *Handler) Register(c *gin.Context) (any, error) {
	in, e := Bind[dto.Credentials](c)
	if e != nil {
		return nil, e
	}
	user, err := h.App.Register(c.Request.Context(), in, false)
	if err == nil {
		middleware.SetUser(c, user)
	}
	return user, err
}
func (h *Handler) Login(c *gin.Context) (any, error) {
	in, e := Bind[dto.Credentials](c)
	if e != nil {
		return nil, e
	}
	user, token, e := h.App.Login(c.Request.Context(), in)
	if e != nil {
		h.App.RecordFailure(c.Request.Context(), enums.EventLoginFailed)
		return nil, e
	}
	middleware.SetUser(c, user)
	middleware.SetCookie(c, h.Config, middleware.SessionCookie, token, 30*86400, true)
	return user, nil
}
func (h *Handler) Logout(c *gin.Context) (any, error) {
	u, _ := middleware.User(c)
	e := h.App.Logout(c.Request.Context(), u.ID, middleware.Cookie(c, middleware.SessionCookie))
	if e == nil {
		middleware.SetCookie(c, h.Config, middleware.SessionCookie, "", -1, true)
	}
	return nil, e
}
func (h *Handler) Me(c *gin.Context) (any, error) { u, _ := middleware.User(c); return u, nil }
func (h *Handler) Profile(c *gin.Context) (any, error) {
	in, e := Bind[dto.Profile](c)
	if e != nil {
		return nil, e
	}
	u, _ := middleware.User(c)
	return nil, h.App.Profile(c.Request.Context(), u.ID, in.DisplayName)
}
func (h *Handler) Password(c *gin.Context) (any, error) {
	in, e := Bind[dto.Password](c)
	if e != nil {
		return nil, e
	}
	u, _ := middleware.User(c)
	e = h.App.ChangePassword(c.Request.Context(), u.ID, in)
	if e == nil {
		middleware.SetCookie(c, h.Config, middleware.SessionCookie, "", -1, true)
	}
	return nil, e
}
func (h *Handler) Site(c *gin.Context) (any, error) { return h.App.Site(c.Request.Context()) }
func (h *Handler) SiteUpdate(c *gin.Context) (any, error) {
	in, e := Bind[vo.Site](c)
	if e != nil {
		return nil, e
	}
	return nil, h.App.UpdateSite(c.Request.Context(), in)
}
func (h *Handler) Posts(admin bool) func(*gin.Context) (any, error) {
	return func(c *gin.Context) (any, error) {
		p, e := page(c)
		if e != nil {
			return nil, e
		}
		return h.App.Posts(c.Request.Context(), p, admin)
	}
}
func (h *Handler) Post(c *gin.Context) (any, error) {
	return h.App.Post(c.Request.Context(), c.Param("key"))
}
func (h *Handler) NewPost(c *gin.Context) (any, error) {
	id, e := h.App.CreatePost(c.Request.Context())
	return map[string]string{"id": id}, e
}
func (h *Handler) Draft(c *gin.Context) (any, error) {
	return h.App.Draft(c.Request.Context(), c.Param("key"))
}
func (h *Handler) SaveDraft(c *gin.Context) (any, error) {
	in, e := Bind[dto.Draft](c)
	if e != nil {
		return nil, e
	}
	return nil, h.App.SaveDraft(c.Request.Context(), c.Param("key"), in)
}
func (h *Handler) Publish(c *gin.Context) (any, error) {
	in, e := Bind[dto.Publish](c)
	if e != nil {
		return nil, e
	}
	return nil, h.App.Publish(c.Request.Context(), c.Param("key"), in)
}
func (h *Handler) PostAction(action enums.PostAction) func(*gin.Context) (any, error) {
	return func(c *gin.Context) (any, error) {
		return nil, h.App.PostAction(c.Request.Context(), c.Param("key"), action)
	}
}
func (h *Handler) SetReaction(kind enums.ReactionKind, on bool) func(*gin.Context) (any, error) {
	return func(c *gin.Context) (any, error) {
		u, _ := middleware.User(c)
		return nil, h.App.SetReaction(c.Request.Context(), u.ID, c.Param("key"), kind, on)
	}
}
func (h *Handler) Reactions(c *gin.Context) (any, error) {
	u, _ := middleware.User(c)
	return h.App.Reactions(c.Request.Context(), u.ID, c.Param("key"))
}
func (h *Handler) Collections(kind enums.ReactionKind) func(*gin.Context) (any, error) {
	return func(c *gin.Context) (any, error) {
		p, e := page(c)
		if e != nil {
			return nil, e
		}
		u, _ := middleware.User(c)
		return h.App.Collections(c.Request.Context(), u.ID, kind, p)
	}
}
func (h *Handler) Taxonomy(kind enums.TaxonomyKind) func(*gin.Context) (any, error) {
	return func(c *gin.Context) (any, error) { return h.App.Taxonomy(c.Request.Context(), kind) }
}
func (h *Handler) Comments(admin bool) func(*gin.Context) (any, error) {
	return func(c *gin.Context) (any, error) {
		p, e := page(c)
		if e != nil {
			return nil, e
		}
		var post *string
		if id := c.Param("key"); id != "" {
			post = &id
		}
		return h.App.Comments(c.Request.Context(), post, p, admin)
	}
}
func (h *Handler) AddComment(c *gin.Context) (any, error) {
	in, e := Bind[dto.Comment](c)
	if e != nil {
		return nil, e
	}
	u, _ := middleware.User(c)
	var post *string
	if id := c.Param("key"); id != "" {
		post = &id
	}
	id, e := h.App.AddComment(c.Request.Context(), u.ID, post, in.Body)
	return map[string]string{"id": id}, e
}
func (h *Handler) Reply(c *gin.Context) (any, error) {
	in, e := Bind[dto.Comment](c)
	if e != nil {
		return nil, e
	}
	u, _ := middleware.User(c)
	return nil, h.App.Reply(c.Request.Context(), u.ID, c.Param("key"), in.Body)
}
func (h *Handler) CommentUpdate(c *gin.Context) (any, error) {
	in, e := Bind[dto.CommentUpdate](c)
	if e != nil {
		return nil, e
	}
	return nil, h.App.UpdateComment(c.Request.Context(), c.Param("key"), in)
}
func (h *Handler) EditReply(c *gin.Context) (any, error) {
	in, e := Bind[dto.Comment](c)
	if e != nil {
		return nil, e
	}
	u, _ := middleware.User(c)
	return nil, h.App.EditReply(c.Request.Context(), u.ID, c.Param("key"), in.Body)
}
func (h *Handler) DeleteComment(admin bool) func(*gin.Context) (any, error) {
	return func(c *gin.Context) (any, error) {
		u, _ := middleware.User(c)
		return nil, h.App.DeleteComment(c.Request.Context(), u.ID, c.Param("key"), admin)
	}
}
func (h *Handler) Events(c *gin.Context) (any, error) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32<<10)
	in, e := Bind[dto.Events](c)
	if e != nil {
		return nil, e
	}
	e = h.App.Events(c.Request.Context(), in)
	return map[string]int{"accepted": len(in.Events)}, e
}
func (h *Handler) Audits(c *gin.Context) (any, error) {
	p, e := page(c)
	if e != nil {
		return nil, e
	}
	if visit := c.Param("visit"); visit != "" {
		p.VisitID = visit
	}
	return h.App.Audits(c.Request.Context(), p)
}
func (h *Handler) Upload(c *gin.Context) (any, error) {
	file, e := c.FormFile("file")
	if e != nil || file.Size > 10<<20 {
		return nil, db.ErrInvalid
	}
	r, e := file.Open()
	if e != nil {
		return nil, e
	}
	defer r.Close()
	key, e := storage.SaveImage(filepath.Join(h.Config.Storage, "uploads"), r)
	if e != nil {
		return nil, db.ErrInvalid
	}
	event := audit.Event(c.Request.Context(), enums.EventMediaUpload, enums.TargetFile, key, enums.ResultSuccess)
	if e = h.App.RecordRead(c.Request.Context(), event); e != nil {
		os.Remove(filepath.Join(h.Config.Storage, "uploads", key))
		return nil, e
	}
	return map[string]string{"url": "/v1/uploads/" + key}, nil
}

var filePattern = regexp.MustCompile(`^[a-f0-9]{32}\.jpg$`)

func (h *Handler) Image(c *gin.Context) {
	key := c.Param("key")
	if !filePattern.MatchString(key) {
		response.Fail(c, 404, enums.CodeNotFound, "图片不存在")
		return
	}
	path := filepath.Join(h.Config.Storage, "uploads", key)
	if _, e := os.Stat(path); e != nil {
		response.Fail(c, 404, enums.CodeNotFound, "图片不存在")
		return
	}
	c.Header("Cache-Control", "public, max-age=86400, immutable")
	c.File(path)
}
