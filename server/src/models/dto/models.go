package dto

import (
	"errors"
	"nightlog/server/src/models/enums"
	"strconv"
	"strings"
)

type Page struct {
	Page      int
	Size      int
	Q         string
	Status    enums.PostStatus
	Category  string
	Tag       string
	Kind      enums.ReactionKind
	EventType enums.AuditEvent
	ActorID   string
	Username  string
	ClientIP  string
	VisitID   string
	Filter    enums.CommentFilter
}

func ParsePage(page, size string) (Page, error) {
	p := Page{Page: 1, Size: 12}
	var err error
	if page != "" {
		p.Page, err = strconv.Atoi(page)
		if err != nil {
			return p, err
		}
	}
	if size != "" {
		p.Size, err = strconv.Atoi(size)
		if err != nil {
			return p, err
		}
	}
	if p.Page < 1 || p.Size < 1 || p.Size > 50 || p.Page > 1000000 {
		return p, errors.New("invalid pagination")
	}
	return p, nil
}
func (p Page) Offset() int { return (p.Page - 1) * p.Size }

type Credentials struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}
type Draft struct {
	Title       string   `json:"title"`
	Slug        string   `json:"slug"`
	Excerpt     string   `json:"excerpt"`
	Markdown    string   `json:"markdown"`
	Category    string   `json:"category"`
	Tags        []string `json:"tags"`
	CoverURL    string   `json:"cover_url"`
	Version     int64    `json:"version"`
	PostVersion int64    `json:"post_version"`
}

func (d Draft) Valid() bool {
	return len(d.Title) <= 600 && len(d.Slug) <= 160 && len(d.Markdown) <= 500000 && len(d.Excerpt) <= 2000 && len(d.Tags) <= 20 && len(d.Category) <= 100 && (d.CoverURL == "" || strings.HasPrefix(d.CoverURL, "/v1/uploads/"))
}

type Comment struct {
	Body string `json:"body"`
}
type CommentUpdate struct {
	Status enums.CommentStatus `json:"status"`
	Read   bool                `json:"read"`
}
type Publish struct {
	Version     int64 `json:"version"`
	PostVersion int64 `json:"post_version"`
}
type Profile struct {
	DisplayName string `json:"display_name"`
}
type Password struct {
	Current  string `json:"current_password"`
	Password string `json:"password"`
}
type Event struct {
	EventID    string           `json:"event_id"`
	EventType  enums.AuditEvent `json:"event_type"`
	VisitID    string           `json:"visit_id"`
	PageViewID string           `json:"page_view_id"`
	Seq        int64            `json:"seq"`
	Path       string           `json:"path"`
	PostID     string           `json:"post_id"`
	DurationMs int64            `json:"duration_ms"`
	Progress   int              `json:"progress"`
	OccurredAt string           `json:"occurred_at"`
}
type Events struct {
	Events []Event `json:"events"`
}
