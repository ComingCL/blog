package router

import (
	"github.com/gin-gonic/gin"
	"nightlog/server/src/handler"
	"nightlog/server/src/models/enums"
)

func RegisterAdmin(r *gin.RouterGroup, h *handler.Handler) {
	wrap := handler.Handle
	r.GET("/posts", wrap(h.Posts(true)))
	r.POST("/posts", handler.Created(h.NewPost))
	r.GET("/posts/:key/draft", wrap(h.Draft))
	r.PATCH("/posts/:key/draft", wrap(h.SaveDraft))
	r.POST("/posts/:key/publish", wrap(h.Publish))
	r.POST("/posts/:key/unpublish", wrap(h.PostAction(enums.ActionUnpublish)))
	r.DELETE("/posts/:key", wrap(h.PostAction(enums.ActionTrash)))
	r.POST("/posts/:key/restore", wrap(h.PostAction(enums.ActionRestore)))
	r.DELETE("/posts/:key/purge", wrap(h.PostAction(enums.ActionPurge)))
	r.GET("/comments", wrap(h.Comments(true)))
	r.PATCH("/comments/:key", wrap(h.CommentUpdate))
	r.DELETE("/comments/:key", wrap(h.DeleteComment(true)))
	r.POST("/comments/:key/replies", wrap(h.Reply))
	r.PATCH("/replies/:key", wrap(h.EditReply))
	r.GET("/settings", wrap(h.Site))
	r.PUT("/settings", wrap(h.SiteUpdate))
	r.GET("/audits", wrap(h.Audits))
	r.GET("/audits/visits/:visit", wrap(h.Audits))
	r.POST("/media", wrap(h.Upload))
}
