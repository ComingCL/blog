// Package testkit provides isolated PostgreSQL schemas for integration tests.
package testkit

import (
	"fmt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"net/url"
	"nightlog/server/src/audit"
)

type Sandbox struct {
	root        *gorm.DB
	DSN, Schema string
}

func New(dsn string) (*Sandbox, error) {
	root, e := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if e != nil {
		return nil, e
	}
	schema := "test_" + audit.ID()
	if e = root.Exec(fmt.Sprintf("CREATE SCHEMA %q", schema)).Error; e != nil {
		return nil, e
	}
	u, e := url.Parse(dsn)
	if e != nil {
		return nil, e
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	return &Sandbox{root: root, DSN: u.String(), Schema: schema}, nil
}
func (s *Sandbox) Close() {
	_ = s.root.Exec(fmt.Sprintf("DROP SCHEMA %q CASCADE", s.Schema)).Error
	if db, e := s.root.DB(); e == nil {
		_ = db.Close()
	}
}
func (s *Sandbox) Tables() ([]string, error) {
	var names []string
	e := s.root.Table("information_schema.tables").Select("table_name").Where("table_schema = ?", s.Schema).Order("table_name").Scan(&names).Error
	return names, e
}
func (s *Sandbox) RejectPublishAudit() error {
	query := fmt.Sprintf(`CREATE FUNCTION %q.reject_publish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type = 'post.publish' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_publish_audit BEFORE INSERT ON %q.audit_logs FOR EACH ROW EXECUTE FUNCTION %q.reject_publish();`, s.Schema, s.Schema, s.Schema)
	return s.root.Exec(query).Error
}
func (s *Sandbox) AllowPublishAudit() error {
	return s.root.Exec(fmt.Sprintf("DROP TRIGGER fail_publish_audit ON %q.audit_logs", s.Schema)).Error
}
