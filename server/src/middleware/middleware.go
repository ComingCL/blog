package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"github.com/gin-gonic/gin"
	"log/slog"
	"net/http"
	"net/netip"
	"nightlog/server/src/audit"
	"nightlog/server/src/config"
	"nightlog/server/src/models/enums"
	"nightlog/server/src/models/vo"
	"nightlog/server/src/response"
	"nightlog/server/src/service"
	"regexp"
	"strings"
	"sync"
	"time"
)

const SessionCookie = "nightlog_session"
const CSRFCookie = "nightlog_csrf"

var idPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{8,80}$`)

func SetCookie(c *gin.Context, cfg config.Config, name, value string, age int, httpOnly bool) {
	http.SetCookie(c.Writer, &http.Cookie{Name: name, Value: value, Path: "/", MaxAge: age, HttpOnly: httpOnly, Secure: cfg.Secure, SameSite: http.SameSiteLaxMode})
}
func Cookie(c *gin.Context, name string) string { v, _ := c.Cookie(name); return v }
func signature(key, value string) string {
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(value))
	return hex.EncodeToString(mac.Sum(nil))
}
func CSRFToken(c *gin.Context, cfg config.Config) string {
	existing := Cookie(c, CSRFCookie)
	parts := strings.Split(existing, ".")
	if len(parts) == 2 && len(existing) < 200 && hmac.Equal([]byte(parts[1]), []byte(signature(cfg.AuditKey, parts[0]+"."+Cookie(c, SessionCookie)))) {
		return existing
	}
	nonce := audit.ID()
	token := nonce + "." + signature(cfg.AuditKey, nonce+"."+Cookie(c, SessionCookie))
	SetCookie(c, cfg, CSRFCookie, token, 3600, false)
	return token
}
func CSRFSafe(c *gin.Context, cfg config.Config) bool {
	token := c.GetHeader("X-CSRF-Token")
	cookie := Cookie(c, CSRFCookie)
	if len(token) > 200 || token == "" || subtle.ConstantTimeCompare([]byte(token), []byte(cookie)) != 1 {
		return false
	}
	parts := strings.Split(token, ".")
	return len(parts) == 2 && hmac.Equal([]byte(parts[1]), []byte(signature(cfg.AuditKey, parts[0]+"."+Cookie(c, SessionCookie))))
}
func Base(app *service.App, cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		rid := c.GetHeader("X-Request-ID")
		if !idPattern.MatchString(rid) {
			rid = audit.ID()
		}
		c.Set("request_id", rid)
		c.Header("X-Request-ID", rid)
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Cache-Control", "private, no-store")
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 12<<20)
		visitor := Cookie(c, "nightlog_visitor")
		if !idPattern.MatchString(visitor) {
			visitor = audit.ID()
			SetCookie(c, cfg, "nightlog_visitor", visitor, 30*86400, true)
		}
		clientIP := c.ClientIP()
		if ip, err := netip.ParseAddr(clientIP); err == nil {
			clientIP = ip.Unmap().String()
		}
		meta := audit.Meta{ClientIP: clientIP, RequestID: rid, VisitorID: visitor, Route: c.FullPath(), Method: c.Request.Method, IPHash: signature(cfg.AuditKey, clientIP), UserAgent: c.GetHeader("User-Agent")}
		if len(meta.UserAgent) > 150 {
			meta.UserAgent = meta.UserAgent[:150]
		}
		if meta.Route == "" {
			meta.Route = "unmatched"
		}
		if hmac.Equal([]byte(c.GetHeader("X-Nightlog-SSR-Key")), []byte(cfg.AuditKey)) {
			meta.CallSource = enums.CallSSR
		} else {
			meta.CallSource = enums.CallBrowserAPI
		}
		c.Request = c.Request.WithContext(audit.With(c.Request.Context(), meta))
		defer func() {
			if recover() != nil {
				app.RecordFailure(c.Request.Context(), enums.EventRequestPanic)
				response.Fail(c, 500, enums.CodeInternalError, "请求处理失败")
			}
			logAccess(c, "access_end", started)
		}()
		if token := Cookie(c, SessionCookie); token != "" {
			if user, e := app.Authenticate(c.Request.Context(), token); e == nil {
				SetUser(c, user)
			}
		}
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead && c.Request.Method != http.MethodOptions {
			origin := c.GetHeader("Origin")
			if origin != cfg.Origin || !CSRFSafe(c, cfg) {
				app.RecordFailure(c.Request.Context(), enums.EventCSRFReject)
				response.Fail(c, 403, enums.CodeCSRFRejected, "请求验证失败，请刷新后重试")
				return
			}
		}
		c.Next()
	}
}

// SetUser is shared by session authentication and successful login/registration.
func SetUser(c *gin.Context, user vo.User) {
	c.Set("user", user)
	meta := audit.From(c.Request.Context())
	meta.ActorID, meta.Username = user.ID, user.Username
	c.Request = c.Request.WithContext(audit.With(c.Request.Context(), meta))
}
func logAccess(c *gin.Context, event string, started time.Time) {
	if c.Writer.Status() < 400 && (c.FullPath() == "/v1/healthz" || c.FullPath() == "/v1/readyz" || c.FullPath() == "/v1/api/auth/csrf" || c.FullPath() == "/v1/uploads/:key") {
		return
	}
	m := audit.From(c.Request.Context())
	level := slog.LevelInfo
	if c.Writer.Status() >= 500 {
		level = slog.LevelError
	} else if c.Writer.Status() >= 400 {
		level = slog.LevelWarn
	}
	slog.Log(c.Request.Context(), level, event, "request_id", m.RequestID, "route", m.Route, "path", c.Request.URL.Path,
		"method", m.Method, "client_ip", m.ClientIP, "user_id", m.ActorID, "username", m.Username,
		"visitor_id", m.VisitorID, "call_source", m.CallSource,
		"status", c.Writer.Status(), "duration_ms", time.Since(started).Milliseconds())
}
func User(c *gin.Context) (vo.User, bool) {
	v, ok := c.Get("user")
	if !ok {
		return vo.User{}, false
	}
	u, ok := v.(vo.User)
	return u, ok
}
func RequireUser(app *service.App) gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := User(c); !ok {
			app.RecordFailure(c.Request.Context(), enums.EventAuthRequired)
			response.Fail(c, 401, enums.CodeUnauthorized, "请先登录")
			return
		}
		c.Next()
	}
}
func RequireAdmin(app *service.App) gin.HandlerFunc {
	return func(c *gin.Context) {
		u, ok := User(c)
		if !ok {
			response.Fail(c, 401, enums.CodeUnauthorized, "请先登录")
			return
		}
		if u.Role != enums.RoleAdmin {
			app.RecordFailure(c.Request.Context(), enums.EventAuthForbidden)
			response.Fail(c, 403, enums.CodeForbidden, "需要管理员权限")
			return
		}
		c.Next()
	}
}

type bucket struct {
	count int
	until time.Time
}

func Rate(limit int) gin.HandlerFunc {
	var mu sync.Mutex
	buckets := map[string]bucket{}
	return func(c *gin.Context) {
		key := c.ClientIP()
		mu.Lock()
		now := time.Now()
		if len(buckets) > 10000 {
			for k, b := range buckets {
				if now.After(b.until) {
					delete(buckets, k)
				}
			}
		}
		b := buckets[key]
		if now.After(b.until) {
			b = bucket{until: now.Add(time.Minute)}
		}
		b.count++
		buckets[key] = b
		mu.Unlock()
		if b.count > limit {
			c.Header("Retry-After", "60")
			response.Fail(c, 429, enums.CodeRateLimited, "操作过于频繁，请稍后重试")
			return
		}
		c.Next()
	}
}
