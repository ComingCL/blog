export const BASE = "/v1";
export const routes = {
  home: "/",
  posts: "/posts",
  guestbook: "/guestbook",
  about: "/about",
  login: "/login",
  register: "/register",
  bookmarks: "/me/bookmarks",
  likes: "/me/likes",
  settings: "/me/settings",
  admin: "/admin/posts",
  newPost: "/admin/posts/new",
  comments: "/admin/comments",
  siteSettings: "/admin/settings",
  audits: "/admin/audits",
  post: (slug: string) => `/posts/${encodeURIComponent(slug)}`,
  edit: (id: string) => `/admin/posts/${encodeURIComponent(id)}/edit`,
  preview: (id: string) => `/admin/posts/${encodeURIComponent(id)}/preview`,
};
export const toPublicPath = (path: string) =>
  path === "/" ? BASE : `${BASE}${path}`;
export function safeReturnTo(value: string | null) {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/v1")
    ? value
    : routes.home;
}
