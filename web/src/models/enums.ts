/** Stable wire values, shared by models and business decisions. */
export enum UserRole {
  Admin = "admin",
  Reader = "reader",
}
export enum PostStatus {
  Draft = "draft",
  Published = "published",
  Trashed = "trashed",
}
export enum CommentStatus {
  Visible = "visible",
  Hidden = "hidden",
  Deleted = "deleted",
}
export enum ReactionKind {
  Like = "like",
  Bookmark = "bookmark",
}
export enum CollectionKind {
  Likes = "likes",
  Bookmarks = "bookmarks",
}
export enum PostAction {
  Trash = "trash",
  Purge = "purge",
  Restore = "restore",
  Unpublish = "unpublish",
}
export enum CommentFilter {
  All = "",
  Unread = "unread",
  Unreplied = "unreplied",
}
export enum AuditSource {
  Server = "server",
  Client = "client",
}
export enum AuditCategory {
  Admin = "admin",
  Behavior = "behavior",
  Security = "security",
}
export enum AuditResult {
  Success = "success",
  Failure = "failure",
  Received = "received",
  NoChange = "no_change",
}
export enum AuthMode {
  Login = "login",
  Register = "register",
}
export enum MediaKind {
  Image = "image",
  Video = "video",
}
export enum ResponseCode {
  OK = "OK",
  NotFound = "NOT_FOUND",
  MethodNotAllowed = "METHOD_NOT_ALLOWED",
  NotReady = "NOT_READY",
  InternalError = "INTERNAL_ERROR",
  Forbidden = "FORBIDDEN",
  InvalidInput = "INVALID_INPUT",
  VersionConflict = "VERSION_CONFLICT",
  Unauthorized = "UNAUTHORIZED",
  CSRFRejected = "CSRF_REJECTED",
  RateLimited = "RATE_LIMITED",
}
export enum ClientErrorCode {
  ConnectionError = "CONNECTION_ERROR",
}
export enum AuditEvent {
  PageView = "page_view",
  ArticleRead = "article_read",
  Engagement = "engagement",
  ContentAccess = "content_access",
  Register = "auth.register",
  Login = "auth.login",
  LoginFailed = "auth.login.failed",
  Logout = "auth.logout",
  Password = "auth.password",
  Profile = "user.profile",
  PostCreate = "post.create",
  DraftSave = "draft.save",
  PostPublish = "post.publish",
  PostUnpublish = "post.unpublish",
  PostTrash = "post.trash",
  PostRestore = "post.restore",
  PostPurge = "post.purge",
  CommentCreate = "comment.create",
  CommentReply = "comment.reply",
  CommentDelete = "comment.delete",
  CommentModerate = "comment.moderate",
  ReplyUpdate = "comment.reply.update",
  LikeAdd = "like.add",
  LikeRemove = "like.remove",
  BookmarkAdd = "bookmark.add",
  BookmarkRemove = "bookmark.remove",
  SettingsUpdate = "settings.update",
  AuditView = "audit_view",
  MediaUpload = "media.upload",
  RequestPanic = "request.panic",
  CSRFReject = "csrf.reject",
  AuthRequired = "auth.required",
  AuthForbidden = "auth.forbidden",
}
