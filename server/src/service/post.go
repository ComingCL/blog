package service

import (
	"context"
	"encoding/json"
	"nightlog/server/src/audit"
	"nightlog/server/src/infrastructure/db"
	"nightlog/server/src/models/dto"
	"nightlog/server/src/models/entity"
	"nightlog/server/src/models/enums"
	"nightlog/server/src/models/vo"
	"nightlog/server/src/models/vo/common"
	"regexp"
	"strings"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func postVO(p *entity.Post, body bool) vo.Post {
	tags := []string{}
	_ = json.Unmarshal(p.Tags, &tags)
	cover := map[string]string{}
	_ = json.Unmarshal(p.Cover, &cover)
	v := vo.Post{ID: p.ID, Slug: p.Slug, Status: p.Status, Title: p.Title, Excerpt: p.Excerpt, Category: p.Category, Tags: tags, CoverURL: cover["url"], PublishedAt: p.PublishedAt, UpdatedAt: p.UpdatedAt, Version: p.Version}
	if body {
		v.Markdown = p.Markdown
	}
	return v
}
func (a *App) Posts(ctx context.Context, p dto.Page, admin bool) (common.PageData[vo.Post], error) {
	rows, total, e := a.DB.Stores().Posts(ctx, p, admin)
	if e != nil {
		return common.PageData[vo.Post]{}, e
	}
	ids := []string{}
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	likes, comments, e := a.DB.Stores().Counts(ctx, ids)
	if e != nil {
		return common.PageData[vo.Post]{}, e
	}
	drafts := map[string]*entity.Draft{}
	if admin {
		drafts, e = a.DB.Stores().Drafts(ctx, ids)
		if e != nil {
			return common.PageData[vo.Post]{}, e
		}
	}
	list := []vo.Post{}
	for _, r := range rows {
		v := postVO(r, false)
		v.Likes = likes[r.ID]
		v.Comments = comments[r.ID]
		if d := drafts[r.ID]; d != nil && admin {
			v.Title = d.Title
			v.Category = d.Category
		}
		list = append(list, v)
	}
	return common.Page(list, total, p.Page, p.Size), nil
}
func (a *App) Post(ctx context.Context, slug string) (vo.Post, error) {
	p, e := a.DB.Stores().PublishedBySlug(ctx, slug)
	if e != nil {
		return vo.Post{}, e
	}
	ev := audit.Event(ctx, enums.EventContentAccess, enums.TargetPost, p.ID, enums.ResultSuccess)
	ev.Category = enums.CategoryBehavior
	if e = a.RecordRead(ctx, ev); e != nil {
		return vo.Post{}, e
	}
	v := postVO(p, true)
	likes, comments, e := a.DB.Stores().Counts(ctx, []string{p.ID})
	v.Likes = likes[p.ID]
	v.Comments = comments[p.ID]
	return v, e
}
func (a *App) CreatePost(ctx context.Context) (string, error) {
	id := audit.ID()
	p := &entity.Post{ID: id, Slug: "draft-" + id, Status: enums.PostDraft, Tags: entity.Encode([]string{}), Cover: entity.Encode(map[string]string{}), Version: 1, UpdatedAt: now()}
	d := &entity.Draft{PostID: id, Slug: p.Slug, Tags: p.Tags, Cover: p.Cover, Version: 1, UpdatedAt: now()}
	e := a.mutate(ctx, enums.EventPostCreate, enums.TargetPost, id, func(s *db.Stores) error { return s.CreatePost(ctx, p, d) })
	return id, e
}
func (a *App) Draft(ctx context.Context, id string) (vo.Draft, error) {
	p, e := a.DB.Stores().PostByID(ctx, id, false)
	if e != nil {
		return vo.Draft{}, e
	}
	d, e := a.DB.Stores().Draft(ctx, id, false)
	if e != nil {
		return vo.Draft{}, e
	}
	tags := []string{}
	_ = json.Unmarshal(d.Tags, &tags)
	cover := map[string]string{}
	_ = json.Unmarshal(d.Cover, &cover)
	return vo.Draft{PostID: id, Title: d.Title, Slug: d.Slug, Excerpt: d.Excerpt, Markdown: d.Markdown, Category: d.Category, Tags: tags, CoverURL: cover["url"], Version: d.Version, PostVersion: p.Version, Status: p.Status}, nil
}
func (a *App) SaveDraft(ctx context.Context, id string, in dto.Draft) error {
	in.Title = strings.TrimSpace(in.Title)
	in.Slug = strings.TrimSpace(in.Slug)
	if !in.Valid() || !slugPattern.MatchString(in.Slug) {
		return db.ErrInvalid
	}
	return a.mutate(ctx, enums.EventDraftSave, enums.TargetPost, id, func(s *db.Stores) error { return s.SaveDraft(ctx, id, in) })
}
func (a *App) Publish(ctx context.Context, id string, in dto.Publish) error {
	return a.mutate(ctx, enums.EventPostPublish, enums.TargetPost, id, func(s *db.Stores) error { return s.Publish(ctx, id, in.Version, in.PostVersion) })
}
func (a *App) PostAction(ctx context.Context, id string, action enums.PostAction) error {
	if !action.Valid() {
		return db.ErrInvalid
	}
	return a.mutate(ctx, action.AuditEvent(), enums.TargetPost, id, func(s *db.Stores) error {
		if action == enums.ActionPurge {
			return s.PurgePost(ctx, id)
		}
		return s.ChangePostStatus(ctx, id, action)
	})
}
func (a *App) SetReaction(ctx context.Context, user, id string, kind enums.ReactionKind, on bool) error {
	if !kind.Valid() {
		return db.ErrInvalid
	}
	return a.DB.Within(ctx, func(s *db.Stores) error {
		changed, e := s.SetReaction(ctx, user, id, kind, on)
		if e != nil {
			return e
		}
		result := enums.ResultSuccess
		if !changed {
			result = enums.ResultNoChange
		}
		ev := audit.Event(ctx, kind.AuditEvent(on), enums.TargetPost, id, result)
		ev.Category = enums.CategoryBehavior
		return s.AppendAudit(ctx, ev)
	})
}
func (a *App) Reactions(ctx context.Context, user, id string) (vo.Reactions, error) {
	rows, e := a.DB.Stores().Reactions(ctx, user, id)
	v := vo.Reactions{}
	for _, r := range rows {
		if r.Kind == enums.ReactionLike {
			v.Liked = true
		}
		if r.Kind == enums.ReactionBookmark {
			v.Bookmarked = true
		}
	}
	return v, e
}
func (a *App) Collections(ctx context.Context, user string, kind enums.ReactionKind, p dto.Page) (common.PageData[vo.Post], error) {
	rows, total, e := a.DB.Stores().Collections(ctx, user, kind, p)
	list := []vo.Post{}
	for _, r := range rows {
		if r.Status != enums.PostPublished {
			list = append(list, vo.Post{ID: r.ID, Title: "文章暂不可用", Unavailable: true, Tags: []string{}})
		} else {
			list = append(list, postVO(r, false))
		}
	}
	return common.Page(list, total, p.Page, p.Size), e
}
func (a *App) Taxonomy(ctx context.Context, kind enums.TaxonomyKind) ([]string, error) {
	rows, _, e := a.DB.Stores().Posts(ctx, dto.Page{Page: 1, Size: 100000}, false)
	if e != nil {
		return nil, e
	}
	set := map[string]bool{}
	result := []string{}
	for _, p := range rows {
		values := []string{p.Category}
		if kind == enums.TaxonomyTags {
			_ = json.Unmarshal(p.Tags, &values)
		}
		for _, v := range values {
			if v != "" && !set[v] {
				set[v] = true
				result = append(result, v)
			}
		}
	}
	return result, nil
}
