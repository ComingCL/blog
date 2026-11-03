package audit

import (
	"encoding/json"
	"nightlog/server/src/models/entity"
	"os"
	"path/filepath"
)

type Spool struct{ Dir string }

func NewSpool(dir string) (*Spool, error) {
	if e := os.MkdirAll(dir, 0700); e != nil {
		return nil, e
	}
	return &Spool{dir}, nil
}
func (s *Spool) Save(event *entity.AuditLog) error {
	b, e := json.Marshal(event)
	if e != nil {
		return e
	}
	f, e := os.CreateTemp(s.Dir, "pending-")
	if e != nil {
		return e
	}
	defer os.Remove(f.Name())
	if _, e = f.Write(b); e != nil {
		f.Close()
		return e
	}
	if e = f.Sync(); e != nil {
		f.Close()
		return e
	}
	if e = f.Close(); e != nil {
		return e
	}
	if e = os.Rename(f.Name(), filepath.Join(s.Dir, event.ID+".json")); e != nil {
		return e
	}
	d, e := os.Open(s.Dir)
	if e != nil {
		return e
	}
	defer d.Close()
	return d.Sync()
}
func (s *Spool) Replay(appendEvent func(*entity.AuditLog) error) error {
	entries, e := os.ReadDir(s.Dir)
	if e != nil {
		return e
	}
	processed := 0
	for _, entry := range entries {
		if filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		if processed >= 100 {
			return nil
		}
		processed++
		path := filepath.Join(s.Dir, entry.Name())
		b, e := os.ReadFile(path)
		if e != nil {
			return e
		}
		var event entity.AuditLog
		if e = json.Unmarshal(b, &event); e != nil {
			return e
		}
		if e = appendEvent(&event); e != nil {
			return e
		}
		if e = os.Remove(path); e != nil {
			return e
		}
	}
	return nil
}
