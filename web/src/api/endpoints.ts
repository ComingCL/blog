import { CollectionKind, ReactionKind, PostAction } from "@/models/enums";
export const API_BASE = "/v1/api";
export const endpoints = {
  site: "/site",
  me: "/me",
  csrf: "/auth/csrf",
  login: "/auth/login",
  register: "/auth/register",
  logout: "/auth/logout",
  password: "/me/password",
  posts: "/posts",
  guestbook: "/guestbook",
  events: "/events",
  categories: "/categories",
  tags: "/tags",
  adminPosts: "/admin/posts",
  adminComments: "/admin/comments",
  adminSettings: "/admin/settings",
  audits: "/admin/audits",
  media: "/admin/media",
  post: (slug: string) => `/posts/${encodeURIComponent(slug)}`,
  draft: (id: string) => `/admin/posts/${encodeURIComponent(id)}/draft`,
  publish: (id: string) => `/admin/posts/${encodeURIComponent(id)}/publish`,
  postAction: (id: string, action: PostAction | "") =>
    `/admin/posts/${encodeURIComponent(id)}${action ? `/${action}` : ""}`,
  comments: (id: string) => `/posts/${encodeURIComponent(id)}/comments`,
  comment: (id: string, admin = false) =>
    `${admin ? "/admin" : "/me"}/comments/${encodeURIComponent(id)}`,
  reply: (id: string) => `/admin/comments/${encodeURIComponent(id)}/replies`,
  editReply: (id: string) => `/admin/replies/${encodeURIComponent(id)}`,
  reactions: (id: string) => `/me/posts/${encodeURIComponent(id)}/reactions`,
  reaction: (id: string, kind: ReactionKind) => `/posts/${encodeURIComponent(id)}/${kind}`,
  collection: (kind: CollectionKind) => `/me/${kind}`,
};
