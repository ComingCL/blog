package db

import (
	"context"
	"gorm.io/gen"
	"gorm.io/gorm/clause"
	"nightlog/server/src/models/dto"
	"nightlog/server/src/models/entity"
	"nightlog/server/src/models/enums"
	"time"
)

func (s *Stores) Comment(ctx context.Context, id string, lock bool) (*entity.Comment, error) {
	c := s.q.Comment
	do := c.WithContext(ctx).Where(c.ID.Eq(id))
	if lock {
		do = do.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	v, e := do.First()
	return v, normalize(e)
}
func (s *Stores) AddComment(ctx context.Context, c *entity.Comment) error {
	if c.PostID != nil {
		p, e := s.PostByID(ctx, *c.PostID, true)
		if e != nil {
			return e
		}
		if p.Status != enums.PostPublished {
			return ErrNotFound
		}
	}
	return s.q.Comment.WithContext(ctx).Create(c)
}
func (s *Stores) Reply(ctx context.Context, parent string, c *entity.Comment) error {
	root, e := s.Comment(ctx, parent, true)
	if e != nil {
		return e
	}
	if root.ParentID != nil || root.Status == enums.CommentDeleted {
		return ErrInvalid
	}
	c.ParentID = &root.ID
	c.PostID = root.PostID
	if e := s.q.Comment.WithContext(ctx).Create(c); e != nil {
		return e
	}
	q := s.q.Comment
	_, e = q.WithContext(ctx).Where(q.ID.Eq(parent)).Update(q.ReadAt, time.Now().UTC())
	return e
}
func (s *Stores) UpdateComment(ctx context.Context, id string, values map[string]interface{}) error {
	q := s.q.Comment
	values["updated_at"] = time.Now().UTC()
	_, e := q.WithContext(ctx).Where(q.ID.Eq(id)).Updates(values)
	return e
}
func (s *Stores) Comments(ctx context.Context, postID *string, p dto.Page, admin bool) ([]*entity.Comment, []*entity.Comment, int64, error) {
	c := s.q.Comment
	do := c.WithContext(ctx).Where(c.ParentID.IsNull())
	if !admin {
		do = do.Where(c.Status.Neq(string(enums.CommentHidden)))
		if postID == nil {
			do = do.Where(c.PostID.IsNull())
		} else {
			post, e := s.PostByID(ctx, *postID, false)
			if e != nil {
				return nil, nil, 0, e
			}
			if post.Status != enums.PostPublished {
				return nil, nil, 0, ErrNotFound
			}
			do = do.Where(c.PostID.Eq(*postID))
		}
	} else {
		if p.Filter == enums.FilterUnread {
			do = do.Where(c.ReadAt.IsNull())
		}
		if p.Filter == enums.FilterUnreplied {
			do = do.Where(gen.Cond(clause.Expr{SQL: "id NOT IN (SELECT parent_id FROM comments WHERE parent_id IS NOT NULL AND status = ?)", Vars: []interface{}{enums.CommentVisible}})...)
		}
	}
	total, e := do.Count()
	if e != nil {
		return nil, nil, 0, e
	}
	rows, e := do.Order(c.CreatedAt.Desc(), c.ID.Desc()).Offset(p.Offset()).Limit(p.Size).Find()
	if e != nil {
		return nil, nil, 0, e
	}
	ids := []string{}
	for _, v := range rows {
		ids = append(ids, v.ID)
	}
	replies := []*entity.Comment{}
	if len(ids) > 0 {
		rd := c.WithContext(ctx).Where(c.ParentID.In(ids...))
		if !admin {
			rd = rd.Where(c.Status.Eq(string(enums.CommentVisible)))
		}
		replies, e = rd.Order(c.CreatedAt.Asc(), c.ID.Asc()).Find()
	}
	return rows, replies, total, e
}
