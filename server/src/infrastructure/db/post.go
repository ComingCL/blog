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

func (s *Stores) PostByID(ctx context.Context, id string, lock bool) (*entity.Post, error) {
	p := s.q.Post
	do := p.WithContext(ctx).Where(p.ID.Eq(id))
	if lock {
		do = do.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	v, e := do.First()
	return v, normalize(e)
}
func (s *Stores) PublishedBySlug(ctx context.Context, slug string) (*entity.Post, error) {
	p := s.q.Post
	v, e := p.WithContext(ctx).Where(p.Slug.Eq(slug), p.Status.Eq(string(enums.PostPublished))).First()
	return v, normalize(e)
}
func (s *Stores) Posts(ctx context.Context, filter dto.Page, admin bool) ([]*entity.Post, int64, error) {
	p := s.q.Post
	do := p.WithContext(ctx)
	if admin {
		if filter.Status != "" {
			do = do.Where(p.Status.Eq(string(filter.Status)))
		} else {
			do = do.Where(p.Status.Neq(string(enums.PostTrashed)))
		}
	} else {
		do = do.Where(p.Status.Eq(string(enums.PostPublished)))
	}
	if filter.Q != "" {
		if admin {
			do = do.Where(gen.Cond(clause.Expr{SQL: "id IN (SELECT post_id FROM drafts WHERE title ILIKE ?)", Vars: []interface{}{"%" + filter.Q + "%"}})...)
		} else {
			do = do.Where(p.Title.Like("%" + filter.Q + "%"))
		}
	}
	if filter.Category != "" {
		do = do.Where(p.Category.Eq(filter.Category))
	}
	if filter.Tag != "" {
		do = do.Where(gen.Cond(clause.Expr{SQL: "tags @> ?::jsonb", Vars: []interface{}{string(entity.Encode([]string{filter.Tag}))}})...)
	}
	total, e := do.Count()
	if e != nil {
		return nil, 0, e
	}
	rows, e := do.Order(p.PublishedAt.Desc(), p.UpdatedAt.Desc(), p.ID.Desc()).Limit(filter.Size).Offset(filter.Offset()).Find()
	return rows, total, e
}
func (s *Stores) CreatePost(ctx context.Context, p *entity.Post, d *entity.Draft) error {
	if e := s.q.Post.WithContext(ctx).Create(p); e != nil {
		return normalize(e)
	}
	return s.q.Draft.WithContext(ctx).Create(d)
}
func (s *Stores) Draft(ctx context.Context, id string, lock bool) (*entity.Draft, error) {
	d := s.q.Draft
	do := d.WithContext(ctx).Where(d.PostID.Eq(id))
	if lock {
		do = do.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	v, e := do.First()
	return v, normalize(e)
}
func (s *Stores) Drafts(ctx context.Context, ids []string) (map[string]*entity.Draft, error) {
	d := s.q.Draft
	rows, e := d.WithContext(ctx).Where(d.PostID.In(ids...)).Find()
	result := map[string]*entity.Draft{}
	for _, v := range rows {
		result[v.PostID] = v
	}
	return result, e
}
func (s *Stores) SaveDraft(ctx context.Context, id string, in dto.Draft) error {
	p, e := s.PostByID(ctx, id, true)
	if e != nil {
		return e
	}
	if p.Status == enums.PostTrashed {
		return ErrConflict
	}
	d, e := s.Draft(ctx, id, true)
	if e != nil {
		return e
	}
	if d.Version != in.Version || p.Version != in.PostVersion {
		return ErrConflict
	}
	if p.PublishedAt != nil && in.Slug != p.Slug {
		return ErrInvalid
	}
	now := time.Now().UTC()
	q := s.q.Draft
	values := map[string]interface{}{"title": in.Title, "slug": in.Slug, "excerpt": in.Excerpt, "markdown": in.Markdown, "category": in.Category, "tags": entity.Encode(in.Tags), "cover": entity.Encode(map[string]string{"url": in.CoverURL}), "version": d.Version + 1, "updated_at": now}
	_, e = q.WithContext(ctx).Where(q.PostID.Eq(id)).Updates(values)
	return normalize(e)
}
func (s *Stores) Publish(ctx context.Context, id string, version, postVersion int64) error {
	p, e := s.PostByID(ctx, id, true)
	if e != nil {
		return e
	}
	if p.Status == enums.PostTrashed {
		return ErrConflict
	}
	d, e := s.Draft(ctx, id, true)
	if e != nil {
		return e
	}
	if d.Version != version || p.Version != postVersion {
		return ErrConflict
	}
	if d.Title == "" || d.Markdown == "" || d.Slug == "" {
		return ErrInvalid
	}
	now := time.Now().UTC()
	published := p.PublishedAt
	if published == nil {
		published = &now
	}
	q := s.q.Post
	_, e = q.WithContext(ctx).Where(q.ID.Eq(id)).Updates(map[string]interface{}{"slug": d.Slug, "status": enums.PostPublished, "title": d.Title, "excerpt": d.Excerpt, "markdown": d.Markdown, "category": d.Category, "tags": d.Tags, "cover": d.Cover, "published_at": published, "updated_at": now, "version": p.Version + 1})
	return normalize(e)
}
func (s *Stores) ChangePostStatus(ctx context.Context, id string, action enums.PostAction) error {
	p, e := s.PostByID(ctx, id, true)
	if e != nil {
		return e
	}
	var status enums.PostStatus
	switch action {
	case enums.ActionRestore:
		if p.Status != enums.PostTrashed {
			return ErrConflict
		}
		status = enums.PostDraft
	case enums.ActionUnpublish:
		if p.Status == enums.PostTrashed {
			return ErrConflict
		}
		status = enums.PostDraft
	case enums.ActionTrash:
		status = enums.PostTrashed
	default:
		return ErrInvalid
	}

	var deleted *time.Time
	now := time.Now().UTC()
	if status == enums.PostTrashed {
		deleted = &now
	}
	q := s.q.Post
	_, e = q.WithContext(ctx).Where(q.ID.Eq(id)).Updates(map[string]interface{}{"status": status, "deleted_at": deleted, "updated_at": now, "version": p.Version + 1})
	return e
}
func (s *Stores) PurgePost(ctx context.Context, id string) error {
	p, e := s.PostByID(ctx, id, true)
	if e != nil {
		return e
	}
	if p.Status != enums.PostTrashed {
		return ErrConflict
	}
	q := s.q.Post
	_, e = q.WithContext(ctx).Where(q.ID.Eq(id)).Delete()
	return e
}

type CountRow struct {
	PostID string
	Count  int64
}

func (s *Stores) Counts(ctx context.Context, ids []string) (map[string]int64, map[string]int64, error) {
	likes := map[string]int64{}
	comments := map[string]int64{}
	var rows []CountRow
	if len(ids) == 0 {
		return likes, comments, nil
	}
	e := s.q.Reaction.WithContext(ctx).UnderlyingDB().Model(&entity.Reaction{}).Select("post_id, count(*) as count").Where("post_id IN ? AND kind = ?", ids, enums.ReactionLike).Group("post_id").Scan(&rows).Error
	if e != nil {
		return nil, nil, e
	}
	for _, r := range rows {
		likes[r.PostID] = r.Count
	}
	rows = nil
	e = s.q.Comment.WithContext(ctx).UnderlyingDB().Model(&entity.Comment{}).Select("post_id, count(*) as count").Where("post_id IN ? AND status = ? AND parent_id IS NULL", ids, enums.CommentVisible).Group("post_id").Scan(&rows).Error
	for _, r := range rows {
		comments[r.PostID] = r.Count
	}
	return likes, comments, e
}
