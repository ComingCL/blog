// Package enums defines closed business candidates. Values are stable database/API contracts.
package enums

// UserRole exposes all supported candidates to callers and IDEs.
type UserRole string

const (
	RoleAdmin  UserRole = "admin"
	RoleReader UserRole = "reader"
)

func (v UserRole) Valid() bool {
	switch v {
	case RoleAdmin, RoleReader:
		return true
	}
	return false
}

// PostStatus exposes all supported candidates to callers and IDEs.
type PostStatus string

const (
	PostDraft     PostStatus = "draft"
	PostPublished PostStatus = "published"
	PostTrashed   PostStatus = "trashed"
)

func (v PostStatus) Valid() bool {
	switch v {
	case PostDraft, PostPublished, PostTrashed:
		return true
	}
	return false
}

// CommentStatus exposes all supported candidates to callers and IDEs.
type CommentStatus string

const (
	CommentVisible CommentStatus = "visible"
	CommentHidden  CommentStatus = "hidden"
	CommentDeleted CommentStatus = "deleted"
)

func (v CommentStatus) Valid() bool {
	switch v {
	case CommentVisible, CommentHidden, CommentDeleted:
		return true
	}
	return false
}

// ReactionKind exposes all supported candidates to callers and IDEs.
type ReactionKind string

const (
	ReactionLike     ReactionKind = "like"
	ReactionBookmark ReactionKind = "bookmark"
)

func (v ReactionKind) Valid() bool {
	switch v {
	case ReactionLike, ReactionBookmark:
		return true
	}
	return false
}

// PostAction exposes all supported candidates to callers and IDEs.
type PostAction string

const (
	ActionUnpublish PostAction = "unpublish"
	ActionTrash     PostAction = "trash"
	ActionRestore   PostAction = "restore"
	ActionPurge     PostAction = "purge"
)

func (v PostAction) Valid() bool {
	switch v {
	case ActionUnpublish, ActionTrash, ActionRestore, ActionPurge:
		return true
	}
	return false
}

// CommentFilter exposes all supported candidates to callers and IDEs.
type CommentFilter string

const (
	FilterAll       CommentFilter = ""
	FilterUnread    CommentFilter = "unread"
	FilterUnreplied CommentFilter = "unreplied"
)

func (v CommentFilter) Valid() bool {
	switch v {
	case FilterAll, FilterUnread, FilterUnreplied:
		return true
	}
	return false
}

// TaxonomyKind exposes all supported candidates to callers and IDEs.
type TaxonomyKind string

const (
	TaxonomyCategories TaxonomyKind = "categories"
	TaxonomyTags       TaxonomyKind = "tags"
)

func (v TaxonomyKind) Valid() bool {
	switch v {
	case TaxonomyCategories, TaxonomyTags:
		return true
	}
	return false
}

// AuditCategory exposes all supported candidates to callers and IDEs.
type AuditCategory string

const (
	CategoryAdmin    AuditCategory = "admin"
	CategorySecurity AuditCategory = "security"
	CategoryBehavior AuditCategory = "behavior"
)

func (v AuditCategory) Valid() bool {
	switch v {
	case CategoryAdmin, CategorySecurity, CategoryBehavior:
		return true
	}
	return false
}

// AuditSource exposes all supported candidates to callers and IDEs.
type AuditSource string

const (
	SourceServer AuditSource = "server"
	SourceClient AuditSource = "client"
)

func (v AuditSource) Valid() bool {
	switch v {
	case SourceServer, SourceClient:
		return true
	}
	return false
}

// AuditResult exposes all supported candidates to callers and IDEs.
type AuditResult string

const (
	ResultSuccess  AuditResult = "success"
	ResultFailure  AuditResult = "failure"
	ResultReceived AuditResult = "received"
	ResultNoChange AuditResult = "no_change"
)

func (v AuditResult) Valid() bool {
	switch v {
	case ResultSuccess, ResultFailure, ResultReceived, ResultNoChange:
		return true
	}
	return false
}

// CallSource exposes all supported candidates to callers and IDEs.
type CallSource string

const (
	CallSSR        CallSource = "ssr"
	CallBrowserAPI CallSource = "browser_or_api"
)

func (v CallSource) Valid() bool {
	switch v {
	case CallSSR, CallBrowserAPI:
		return true
	}
	return false
}

// AuditTarget exposes all supported candidates to callers and IDEs.
type AuditTarget string

const (
	TargetPost    AuditTarget = "post"
	TargetUser    AuditTarget = "user"
	TargetComment AuditTarget = "comment"
	TargetPage    AuditTarget = "page"
	TargetRequest AuditTarget = "request"
	TargetAudit   AuditTarget = "audit"
	TargetFile    AuditTarget = "file"
	TargetSite    AuditTarget = "site"
)

func (v AuditTarget) Valid() bool {
	switch v {
	case TargetPost, TargetUser, TargetComment, TargetPage, TargetRequest, TargetAudit, TargetFile, TargetSite:
		return true
	}
	return false
}

// ResponseCode exposes all supported candidates to callers and IDEs.
type ResponseCode string

const (
	CodeOK               ResponseCode = "OK"
	CodeNotFound         ResponseCode = "NOT_FOUND"
	CodeMethodNotAllowed ResponseCode = "METHOD_NOT_ALLOWED"
	CodeNotReady         ResponseCode = "NOT_READY"
	CodeInternalError    ResponseCode = "INTERNAL_ERROR"
	CodeForbidden        ResponseCode = "FORBIDDEN"
	CodeInvalidInput     ResponseCode = "INVALID_INPUT"
	CodeVersionConflict  ResponseCode = "VERSION_CONFLICT"
	CodeUnauthorized     ResponseCode = "UNAUTHORIZED"
	CodeCSRFRejected     ResponseCode = "CSRF_REJECTED"
	CodeRateLimited      ResponseCode = "RATE_LIMITED"
)

func (v ResponseCode) Valid() bool {
	switch v {
	case CodeOK, CodeNotFound, CodeMethodNotAllowed, CodeNotReady, CodeInternalError, CodeForbidden, CodeInvalidInput, CodeVersionConflict, CodeUnauthorized, CodeCSRFRejected, CodeRateLimited:
		return true
	}
	return false
}

// AuditEvent exposes all supported candidates to callers and IDEs.
type AuditEvent string

const (
	EventPageView        AuditEvent = "page_view"
	EventArticleRead     AuditEvent = "article_read"
	EventEngagement      AuditEvent = "engagement"
	EventContentAccess   AuditEvent = "content_access"
	EventRegister        AuditEvent = "auth.register"
	EventLogin           AuditEvent = "auth.login"
	EventLoginFailed     AuditEvent = "auth.login.failed"
	EventLogout          AuditEvent = "auth.logout"
	EventPassword        AuditEvent = "auth.password"
	EventProfile         AuditEvent = "user.profile"
	EventPostCreate      AuditEvent = "post.create"
	EventDraftSave       AuditEvent = "draft.save"
	EventPostPublish     AuditEvent = "post.publish"
	EventPostUnpublish   AuditEvent = "post.unpublish"
	EventPostTrash       AuditEvent = "post.trash"
	EventPostRestore     AuditEvent = "post.restore"
	EventPostPurge       AuditEvent = "post.purge"
	EventCommentCreate   AuditEvent = "comment.create"
	EventCommentReply    AuditEvent = "comment.reply"
	EventCommentDelete   AuditEvent = "comment.delete"
	EventCommentModerate AuditEvent = "comment.moderate"
	EventReplyUpdate     AuditEvent = "comment.reply.update"
	EventLikeAdd         AuditEvent = "like.add"
	EventLikeRemove      AuditEvent = "like.remove"
	EventBookmarkAdd     AuditEvent = "bookmark.add"
	EventBookmarkRemove  AuditEvent = "bookmark.remove"
	EventSettingsUpdate  AuditEvent = "settings.update"
	EventAuditView       AuditEvent = "audit_view"
	EventMediaUpload     AuditEvent = "media.upload"
	EventRequestPanic    AuditEvent = "request.panic"
	EventCSRFReject      AuditEvent = "csrf.reject"
	EventAuthRequired    AuditEvent = "auth.required"
	EventAuthForbidden   AuditEvent = "auth.forbidden"
)

func (v AuditEvent) Valid() bool {
	switch v {
	case EventPageView, EventArticleRead, EventEngagement, EventContentAccess, EventRegister, EventLogin, EventLoginFailed, EventLogout, EventPassword, EventProfile, EventPostCreate, EventDraftSave, EventPostPublish, EventPostUnpublish, EventPostTrash, EventPostRestore, EventPostPurge, EventCommentCreate, EventCommentReply, EventCommentDelete, EventCommentModerate, EventReplyUpdate, EventLikeAdd, EventLikeRemove, EventBookmarkAdd, EventBookmarkRemove, EventSettingsUpdate, EventAuditView, EventMediaUpload, EventRequestPanic, EventCSRFReject, EventAuthRequired, EventAuthForbidden:
		return true
	}
	return false
}

func (v AuditEvent) IsClientEvent() bool {
	return v == EventPageView || v == EventArticleRead || v == EventEngagement
}
func (v PostAction) AuditEvent() AuditEvent {
	switch v {
	case ActionUnpublish:
		return EventPostUnpublish
	case ActionTrash:
		return EventPostTrash
	case ActionRestore:
		return EventPostRestore
	case ActionPurge:
		return EventPostPurge
	}
	return ""
}
func (v ReactionKind) AuditEvent(on bool) AuditEvent {
	switch v {
	case ReactionLike:
		if on {
			return EventLikeAdd
		}
		return EventLikeRemove
	case ReactionBookmark:
		if on {
			return EventBookmarkAdd
		}
		return EventBookmarkRemove
	}
	return ""
}
