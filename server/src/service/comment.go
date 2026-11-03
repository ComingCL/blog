package service

import (
	"context"
	"nightlog/server/src/audit"
	"nightlog/server/src/infrastructure/db"
	"nightlog/server/src/models/dto"
	"nightlog/server/src/models/entity"
	"nightlog/server/src/models/enums"
	"nightlog/server/src/models/vo"
	"nightlog/server/src/models/vo/common"
	"strings"
	"unicode/utf8"
)

func validBody(body string) bool {
	return strings.TrimSpace(body) != "" && utf8.RuneCountInString(body) <= 2000
}
func (a *App) AddComment(ctx context.Context, user string, post *string, body string) (string, error) {
	body = strings.TrimSpace(body)
	if !validBody(body) {
		return "", db.ErrInvalid
	}
	id := audit.ID()
	c := &entity.Comment{ID: id, PostID: post, AuthorID: user, Body: body, Status: enums.CommentVisible, CreatedAt: now(), UpdatedAt: now()}
	e := a.mutate(ctx, enums.EventCommentCreate, enums.TargetComment, id, func(s *db.Stores) error { return s.AddComment(ctx, c) })
	return id, e
}
func (a *App) Reply(ctx context.Context, user, id, body string) error {
	body = strings.TrimSpace(body)
	if !validBody(body) {
		return db.ErrInvalid
	}
	c := &entity.Comment{ID: audit.ID(), AuthorID: user, Body: body, Status: enums.CommentVisible, CreatedAt: now(), UpdatedAt: now()}
	return a.mutate(ctx, enums.EventCommentReply, enums.TargetComment, id, func(s *db.Stores) error { return s.Reply(ctx, id, c) })
}
func (a *App) DeleteComment(ctx context.Context, user, id string, admin bool) error {
	return a.mutate(ctx, enums.EventCommentDelete, enums.TargetComment, id, func(s *db.Stores) error {
		c, e := s.Comment(ctx, id, true)
		if e != nil {
			return e
		}
		if !admin && c.AuthorID != user {
			return db.ErrForbidden
		}
		return s.UpdateComment(ctx, id, map[string]interface{}{"status": enums.CommentDeleted, "body": "", "deleted_at": now()})
	})
}
func (a *App) UpdateComment(ctx context.Context, id string, in dto.CommentUpdate) error {
	if in.Status != "" && in.Status != enums.CommentVisible && in.Status != enums.CommentHidden {
		return db.ErrInvalid
	}
	return a.mutate(ctx, enums.EventCommentModerate, enums.TargetComment, id, func(s *db.Stores) error {
		if _, e := s.Comment(ctx, id, true); e != nil {
			return e
		}
		values := map[string]interface{}{}
		if in.Status != "" {
			values["status"] = in.Status
		}
		if in.Read {
			values["read_at"] = now()
		}
		return s.UpdateComment(ctx, id, values)
	})
}
func (a *App) EditReply(ctx context.Context, user, id, body string) error {
	if !validBody(body) {
		return db.ErrInvalid
	}
	return a.mutate(ctx, enums.EventReplyUpdate, enums.TargetComment, id, func(s *db.Stores) error {
		c, e := s.Comment(ctx, id, true)
		if e != nil {
			return e
		}
		if c.ParentID == nil || c.AuthorID != user {
			return db.ErrForbidden
		}
		return s.UpdateComment(ctx, id, map[string]interface{}{"body": strings.TrimSpace(body)})
	})
}
func (a *App) Comments(ctx context.Context, post *string, p dto.Page, admin bool) (common.PageData[vo.Comment], error) {
	roots, replies, total, e := a.DB.Stores().Comments(ctx, post, p, admin)
	if e != nil {
		return common.PageData[vo.Comment]{}, e
	}
	ids := []string{}
	all := append(append([]*entity.Comment{}, roots...), replies...)
	for _, r := range all {
		ids = append(ids, r.AuthorID)
	}
	authors, e := a.DB.Stores().AuthorNames(ctx, ids)
	if e != nil {
		return common.PageData[vo.Comment]{}, e
	}
	makeVO := func(r *entity.Comment) vo.Comment {
		v := vo.Comment{ID: r.ID, PostID: r.PostID, ParentID: r.ParentID, AuthorID: r.AuthorID, Body: r.Body, Status: r.Status, ReadAt: r.ReadAt, CreatedAt: r.CreatedAt, Replies: []vo.Comment{}}
		if u := authors[r.AuthorID]; u != nil {
			v.AuthorName = u.DisplayName
			v.IsAdmin = u.Role == enums.RoleAdmin
		}
		if r.Status == enums.CommentDeleted {
			v.Body = "该留言已删除"
			v.AuthorName = "已删除"
		}
		return v
	}
	group := map[string][]vo.Comment{}
	for _, r := range replies {
		if r.ParentID != nil {
			group[*r.ParentID] = append(group[*r.ParentID], makeVO(r))
		}
	}
	list := []vo.Comment{}
	for _, r := range roots {
		v := makeVO(r)
		if rs := group[r.ID]; rs != nil {
			v.Replies = rs
		}
		list = append(list, v)
	}
	return common.Page(list, total, p.Page, p.Size), nil
}
