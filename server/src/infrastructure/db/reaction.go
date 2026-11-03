package db

import (
	"context"
	"gorm.io/gorm/clause"
	"nightlog/server/src/models/dto"
	"nightlog/server/src/models/entity"
	"nightlog/server/src/models/enums"
	"time"
)

func (s *Stores) SetReaction(ctx context.Context, user, id string, kind enums.ReactionKind, on bool) (bool, error) {
	p, e := s.PostByID(ctx, id, true)
	if e != nil {
		return false, e
	}
	if on && p.Status != enums.PostPublished {
		return false, ErrNotFound
	}
	r := s.q.Reaction
	if on {
		row := &entity.Reaction{UserID: user, PostID: id, Kind: kind, CreatedAt: time.Now().UTC()}
		result := s.q.Reaction.WithContext(ctx).UnderlyingDB().Clauses(clause.OnConflict{DoNothing: true}).Create(row)
		return result.RowsAffected > 0, result.Error
	}
	result, e := r.WithContext(ctx).Where(r.UserID.Eq(user), r.PostID.Eq(id), r.Kind.Eq(string(kind))).Delete()
	return result.RowsAffected > 0, e
}
func (s *Stores) Reactions(ctx context.Context, user, id string) ([]*entity.Reaction, error) {
	r := s.q.Reaction
	return r.WithContext(ctx).Where(r.UserID.Eq(user), r.PostID.Eq(id)).Find()
}
func (s *Stores) Collections(ctx context.Context, user string, kind enums.ReactionKind, p dto.Page) ([]*entity.Post, int64, error) {
	r := s.q.Reaction
	do := r.WithContext(ctx).Where(r.UserID.Eq(user), r.Kind.Eq(string(kind)))
	total, e := do.Count()
	if e != nil {
		return nil, 0, e
	}
	rs, e := do.Order(r.CreatedAt.Desc(), r.PostID.Desc()).Offset(p.Offset()).Limit(p.Size).Find()
	if e != nil {
		return nil, 0, e
	}
	ids := []string{}
	for _, v := range rs {
		ids = append(ids, v.PostID)
	}
	if len(ids) == 0 {
		return []*entity.Post{}, total, nil
	}
	q := s.q.Post
	rows, e := q.WithContext(ctx).Where(q.ID.In(ids...)).Find()
	byID := map[string]*entity.Post{}
	for _, v := range rows {
		byID[v.ID] = v
	}
	ordered := []*entity.Post{}
	for _, id := range ids {
		if v := byID[id]; v != nil {
			ordered = append(ordered, v)
		}
	}
	return ordered, total, e
}
