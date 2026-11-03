package router

import (
	"github.com/gin-gonic/gin"
	"nightlog/server/src/config"
	"nightlog/server/src/handler"
	"nightlog/server/src/middleware"
	"nightlog/server/src/models/enums"
	"nightlog/server/src/response"
	"nightlog/server/src/service"
)

func New(app *service.App, cfg config.Config) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	// Only the local, sanitizing Next.js entry is trusted to forward visitor IPs.
	_ = r.SetTrustedProxies([]string{"127.0.0.1", "::1"})
	r.RemoteIPHeaders = []string{"X-Forwarded-For"}
	r.HandleMethodNotAllowed = true
	r.MaxMultipartMemory = 1 << 20
	r.Use(middleware.Base(app, cfg), middleware.Rate(300))
	h := &handler.Handler{App: app, Config: cfg}
	v1 := r.Group("/v1")
	v1.GET("/healthz", func(c *gin.Context) { response.OK(c, map[string]string{"status": "ok"}) })
	v1.GET("/readyz", func(c *gin.Context) {
		if e := app.DB.Ping(c.Request.Context()); e != nil {
			response.Fail(c, 503, enums.CodeNotReady, "数据库不可用")
			return
		}
		response.OK(c, map[string]string{"status": "ready"})
	})
	v1.GET("/uploads/:key", h.Image)
	api := v1.Group("/api")
	RegisterPublic(api, h)
	RegisterReader(api.Group("", middleware.RequireUser(app)), h)
	RegisterAdmin(api.Group("/admin", middleware.RequireAdmin(app)), h)
	r.NoRoute(func(c *gin.Context) { response.Fail(c, 404, enums.CodeNotFound, "接口不存在") })
	r.NoMethod(func(c *gin.Context) { response.Fail(c, 405, enums.CodeMethodNotAllowed, "请求方法不支持") })
	return r
}
