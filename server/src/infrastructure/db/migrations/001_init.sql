CREATE TABLE IF NOT EXISTS users (
 id varchar(36) PRIMARY KEY, username varchar(24) UNIQUE NOT NULL,
 display_name varchar(40) NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','reader')), is_site_owner boolean NOT NULL DEFAULT false,
 sessions jsonb NOT NULL DEFAULT '[]', site_settings jsonb NOT NULL DEFAULT '{}',
 settings_version bigint NOT NULL DEFAULT 1, auth_version bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 CHECK(NOT is_site_owner OR role='admin')
);
CREATE UNIQUE INDEX IF NOT EXISTS one_site_owner ON users(is_site_owner) WHERE is_site_owner;
CREATE TABLE IF NOT EXISTS posts (
 id varchar(36) PRIMARY KEY, slug text UNIQUE NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','published','trashed')),
 title text NOT NULL DEFAULT '', excerpt text NOT NULL DEFAULT '', markdown text NOT NULL DEFAULT '',
 category text NOT NULL DEFAULT '', tags jsonb NOT NULL DEFAULT '[]', cover jsonb NOT NULL DEFAULT '{}',
 published_at timestamptz, updated_at timestamptz NOT NULL, deleted_at timestamptz,
 version bigint NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS drafts (
 post_id varchar(36) PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
 title text NOT NULL DEFAULT '', slug text NOT NULL DEFAULT '', excerpt text NOT NULL DEFAULT '',
 markdown text NOT NULL DEFAULT '', category text NOT NULL DEFAULT '', tags jsonb NOT NULL DEFAULT '[]',
 cover jsonb NOT NULL DEFAULT '{}', version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS reactions (
 user_id varchar(36) REFERENCES users(id), post_id varchar(36) REFERENCES posts(id) ON DELETE CASCADE,
 kind text CHECK(kind IN ('like','bookmark')), created_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,post_id,kind)
);
CREATE TABLE IF NOT EXISTS comments (
 id varchar(36) PRIMARY KEY, post_id varchar(36) REFERENCES posts(id) ON DELETE CASCADE,
 parent_id varchar(36) REFERENCES comments(id) ON DELETE CASCADE,
 author_id varchar(36) NOT NULL REFERENCES users(id), body text NOT NULL,
 status text NOT NULL CHECK(status IN ('visible','hidden','deleted')),
 read_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id varchar(36) PRIMARY KEY, event_id text UNIQUE NOT NULL, event_type text NOT NULL,
 category text NOT NULL, source text NOT NULL, actor_id text NOT NULL DEFAULT '',
 visitor_id text NOT NULL DEFAULT '', visit_id text NOT NULL DEFAULT '', page_view_id text NOT NULL DEFAULT '',
 seq bigint NOT NULL DEFAULT 0, request_id text NOT NULL DEFAULT '', target_type text NOT NULL DEFAULT '',
 target_id text NOT NULL DEFAULT '', route text NOT NULL DEFAULT '', method text NOT NULL DEFAULT '',
 status_code integer NOT NULL DEFAULT 0, result text NOT NULL DEFAULT '', duration_ms bigint NOT NULL DEFAULT 0,
 ip_hash text NOT NULL DEFAULT '', user_agent_summary text NOT NULL DEFAULT '',
 payload jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_feed ON posts(status,published_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS comments_thread ON comments(post_id,status,created_at,id);
CREATE INDEX IF NOT EXISTS reactions_collection ON reactions(user_id,kind,created_at DESC,post_id);
CREATE INDEX IF NOT EXISTS audits_actor ON audit_logs(actor_id,occurred_at DESC,id);
CREATE INDEX IF NOT EXISTS audits_visit ON audit_logs(visitor_id,visit_id,occurred_at,id);
CREATE INDEX IF NOT EXISTS audits_event ON audit_logs(event_type,occurred_at DESC,id);
CREATE INDEX IF NOT EXISTS audits_request ON audit_logs(request_id);
CREATE UNIQUE INDEX IF NOT EXISTS audits_client_sequence ON audit_logs(visitor_id,page_view_id,event_type,seq)
 WHERE source='client' AND page_view_id<>'';
