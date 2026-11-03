package router

import (
	"github.com/gin-gonic/gin"
	"nightlog/server/src/handler"
	"nightlog/server/src/middleware"
	"nightlog/server/src/models/enums"
)

func RegisterPublic(r *gin.RouterGroup, h *handler.Handler) {
	wrap := handler.Handle
	r.GET("/site", wrap(h.Site))
	r.GET("/posts", wrap(h.Posts(false)))
	r.GET("/posts/:key", wrap(h.Post))
	r.GET("/posts/:key/comments", wrap(h.Comments(false)))
	r.GET("/guestbook", wrap(h.Comments(false)))
	r.GET("/categories", wrap(h.Taxonomy(enums.TaxonomyCategories)))
	r.GET("/tags", wrap(h.Taxonomy(enums.TaxonomyTags)))
	r.GET("/auth/csrf", wrap(h.CSRF))
	auth := r.Group("/auth", middleware.Rate(20))
	auth.POST("/register", handler.Created(h.Register))
	auth.POST("/login", wrap(h.Login))
	r.POST("/events", middleware.Rate(80), wrap(h.Events))
}
