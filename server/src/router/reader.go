package router

import (
	"github.com/gin-gonic/gin"
	"nightlog/server/src/handler"
	"nightlog/server/src/middleware"
	"nightlog/server/src/models/enums"
)

func RegisterReader(r *gin.RouterGroup, h *handler.Handler) {
	wrap := handler.Handle
	r.GET("/me", wrap(h.Me))
	r.PATCH("/me", wrap(h.Profile))
	r.PUT("/me/password", wrap(h.Password))
	r.POST("/auth/logout", wrap(h.Logout))
	r.GET("/me/posts/:key/reactions", wrap(h.Reactions))
	r.GET("/me/likes", wrap(h.Collections(enums.ReactionLike)))
	r.GET("/me/bookmarks", wrap(h.Collections(enums.ReactionBookmark)))
	for _, kind := range []enums.ReactionKind{enums.ReactionLike, enums.ReactionBookmark} {
		r.PUT("/posts/:key/"+string(kind), wrap(h.SetReaction(kind, true)))
		r.DELETE("/posts/:key/"+string(kind), wrap(h.SetReaction(kind, false)))
	}
	r.POST("/posts/:key/comments", middleware.Rate(15), handler.Created(h.AddComment))
	r.POST("/guestbook", middleware.Rate(15), handler.Created(h.AddComment))
	r.DELETE("/me/comments/:key", wrap(h.DeleteComment(false)))
}
