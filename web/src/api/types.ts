import {
  UserRole,
  PostStatus,
  CommentStatus,
  AuditEvent,
  AuditCategory,
  AuditSource,
  AuditResult,
  ResponseCode,
} from "@/models/enums";
export interface Envelope<T> {
  code: ResponseCode;
  message: string;
  data: T;
  request_id: string;
  timestamp: string;
}
export interface Page<T> {
  list: T[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_next: boolean;
  };
}
export interface User {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
}
export interface Site {
  name: string;
  english_name: string;
  description: string;
  hero_motion_enabled: boolean;
  version: number;
}
export interface Post {
  id: string;
  slug: string;
  status: PostStatus;
  title: string;
  excerpt: string;
  markdown?: string;
  category: string;
  tags: string[];
  cover_url: string;
  published_at: string | null;
  updated_at: string;
  version: number;
  likes: number;
  comments: number;
  unavailable?: boolean;
}
export interface Draft {
  post_id: string;
  title: string;
  slug: string;
  excerpt: string;
  markdown: string;
  category: string;
  tags: string[];
  cover_url: string;
  version: number;
  post_version: number;
  status: PostStatus;
}
export interface Comment {
  id: string;
  post_id: string | null;
  parent_id: string | null;
  author_id: string;
  author_name: string;
  is_admin: boolean;
  body: string;
  status: CommentStatus;
  read_at: string | null;
  created_at: string;
  replies: Comment[];
}
export interface Audit {
  id: string;
  event_type: AuditEvent;
  category: AuditCategory;
  source: AuditSource;
  actor_id: string;
  username: string;
  client_ip: string;
  visitor_id: string;
  visit_id: string;
  request_id: string;
  target_id: string;
  route: string;
  result: AuditResult;
  duration_ms: number;
  occurred_at: string;
}
export const defaultSite: Site = {
  name: "Clarence Liu",
  english_name: "CLARENCE LIU",
  description: "关于代码、生活，以及那些值得留下的瞬间。",
  hero_motion_enabled: true,
  version: 1,
};
