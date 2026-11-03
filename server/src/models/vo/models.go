package vo

import (
	"nightlog/server/src/models/enums"
	"time"
)

type User struct {
	ID          string         `json:"id"`
	Username    string         `json:"username"`
	DisplayName string         `json:"display_name"`
	Role        enums.UserRole `json:"role"`
}
type Site struct {
	Name        string `json:"name"`
	EnglishName string `json:"english_name"`
	Description string `json:"description"`
	Motion      bool   `json:"hero_motion_enabled"`
	Version     int64  `json:"version"`
}
type Post struct {
	ID          string           `json:"id"`
	Slug        string           `json:"slug"`
	Status      enums.PostStatus `json:"status"`
	Title       string           `json:"title"`
	Excerpt     string           `json:"excerpt"`
	Markdown    string           `json:"markdown,omitempty"`
	Category    string           `json:"category"`
	Tags        []string         `json:"tags"`
	CoverURL    string           `json:"cover_url"`
	PublishedAt *time.Time       `json:"published_at"`
	UpdatedAt   time.Time        `json:"updated_at"`
	Version     int64            `json:"version"`
	Likes       int64            `json:"likes"`
	Comments    int64            `json:"comments"`
	Unavailable bool             `json:"unavailable,omitempty"`
}
type Draft struct {
	PostID      string           `json:"post_id"`
	Title       string           `json:"title"`
	Slug        string           `json:"slug"`
	Excerpt     string           `json:"excerpt"`
	Markdown    string           `json:"markdown"`
	Category    string           `json:"category"`
	Tags        []string         `json:"tags"`
	CoverURL    string           `json:"cover_url"`
	Version     int64            `json:"version"`
	PostVersion int64            `json:"post_version"`
	Status      enums.PostStatus `json:"status"`
}
type Comment struct {
	ID         string              `json:"id"`
	PostID     *string             `json:"post_id"`
	ParentID   *string             `json:"parent_id"`
	AuthorID   string              `json:"author_id"`
	AuthorName string              `json:"author_name"`
	IsAdmin    bool                `json:"is_admin"`
	Body       string              `json:"body"`
	Status     enums.CommentStatus `json:"status"`
	ReadAt     *time.Time          `json:"read_at"`
	CreatedAt  time.Time           `json:"created_at"`
	PostTitle  string              `json:"post_title,omitempty"`
	Replies    []Comment           `json:"replies"`
}
type Reactions struct {
	Liked      bool `json:"liked"`
	Bookmarked bool `json:"bookmarked"`
}

type Audit struct {
	ID         string              `json:"id"`
	EventType  enums.AuditEvent    `json:"event_type"`
	Category   enums.AuditCategory `json:"category"`
	Source     enums.AuditSource   `json:"source"`
	ActorID    string              `json:"actor_id"`
	Username   string              `json:"username"`
	ClientIP   string              `json:"client_ip"`
	VisitorID  string              `json:"visitor_id"`
	VisitID    string              `json:"visit_id"`
	RequestID  string              `json:"request_id"`
	TargetID   string              `json:"target_id"`
	Route      string              `json:"route"`
	Result     enums.AuditResult   `json:"result"`
	DurationMs int64               `json:"duration_ms"`
	OccurredAt time.Time           `json:"occurred_at"`
}
