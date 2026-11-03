package entity

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"nightlog/server/src/models/enums"
	"time"
)

// JSON contains typed, schema-controlled JSON values. It never stores credentials in plaintext.
type JSON []byte

func (j JSON) Value() (driver.Value, error) {
	if len(j) == 0 {
		return "{}", nil
	}
	return string(j), nil
}
func (j *JSON) Scan(value any) error {
	switch v := value.(type) {
	case []byte:
		*j = append((*j)[:0], v...)
	case string:
		*j = []byte(v)
	case nil:
		*j = []byte("{}")
	default:
		return fmt.Errorf("unsupported JSON type %T", value)
	}
	return nil
}
func Encode(v any) JSON { b, _ := json.Marshal(v); return b }

type User struct {
	ID              string         `gorm:"primaryKey;size:36"`
	Username        string         `gorm:"uniqueIndex;size:24;not null"`
	DisplayName     string         `gorm:"size:40;not null"`
	PasswordHash    string         `gorm:"not null"`
	Role            enums.UserRole `gorm:"not null"`
	IsSiteOwner     bool           `gorm:"not null"`
	Sessions        JSON           `gorm:"type:jsonb;not null"`
	SiteSettings    JSON           `gorm:"type:jsonb;not null"`
	SettingsVersion int64          `gorm:"not null"`
	AuthVersion     int64          `gorm:"not null"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type Post struct {
	ID          string           `gorm:"primaryKey;size:36"`
	Slug        string           `gorm:"uniqueIndex;not null"`
	Status      enums.PostStatus `gorm:"not null"`
	Title       string           `gorm:"not null"`
	Excerpt     string
	Markdown    string
	Category    string
	Tags        JSON `gorm:"type:jsonb;not null"`
	Cover       JSON `gorm:"type:jsonb;not null"`
	PublishedAt *time.Time
	UpdatedAt   time.Time
	DeletedAt   *time.Time
	Version     int64 `gorm:"not null"`
}

type Draft struct {
	PostID    string `gorm:"primaryKey;size:36"`
	Title     string
	Slug      string
	Excerpt   string
	Markdown  string
	Category  string
	Tags      JSON  `gorm:"type:jsonb;not null"`
	Cover     JSON  `gorm:"type:jsonb;not null"`
	Version   int64 `gorm:"not null"`
	UpdatedAt time.Time
}

type Reaction struct {
	UserID    string             `gorm:"primaryKey;size:36"`
	PostID    string             `gorm:"primaryKey;size:36"`
	Kind      enums.ReactionKind `gorm:"primaryKey;size:12"`
	CreatedAt time.Time
}

type Comment struct {
	ID        string              `gorm:"primaryKey;size:36"`
	PostID    *string             `gorm:"size:36"`
	ParentID  *string             `gorm:"size:36"`
	AuthorID  string              `gorm:"size:36;not null"`
	Body      string              `gorm:"not null"`
	Status    enums.CommentStatus `gorm:"not null"`
	ReadAt    *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt *time.Time
}

type AuditLog struct {
	ID               string              `gorm:"primaryKey;size:36"`
	EventID          string              `gorm:"uniqueIndex;not null"`
	EventType        enums.AuditEvent    `gorm:"not null"`
	Category         enums.AuditCategory `gorm:"not null"`
	Source           enums.AuditSource   `gorm:"not null"`
	ActorID          string
	ActorUsername    string
	ClientIP         string
	VisitorID        string
	VisitID          string
	PageViewID       string
	Seq              int64
	RequestID        string
	TargetType       enums.AuditTarget
	TargetID         string
	Route            string
	Method           string
	StatusCode       int
	Result           enums.AuditResult
	DurationMs       int64
	IPHash           string
	UserAgentSummary string
	Payload          JSON `gorm:"type:jsonb;not null"`
	OccurredAt       time.Time
	ReceivedAt       time.Time
}
