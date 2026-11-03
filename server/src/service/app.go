package service

import (
	"context"
	"encoding/json"
	"nightlog/server/src/audit"
	"nightlog/server/src/infrastructure/db"
	"nightlog/server/src/models/entity"
	"nightlog/server/src/models/enums"
	"nightlog/server/src/models/vo"
	"strings"
	"time"
)

type App struct {
	DB    *db.Database
	Spool *audit.Spool
}

func New(database *db.Database) *App { return &App{DB: database} }
func userVO(u *entity.User) vo.User {
	return vo.User{ID: u.ID, Username: u.Username, DisplayName: u.DisplayName, Role: u.Role}
}
func DefaultSite() vo.Site {
	return vo.Site{Name: "Clarence Liu", EnglishName: "CLARENCE LIU", Description: "关于代码、生活，以及那些值得留下的瞬间。", Motion: true, Version: 1}
}
func (a *App) Site(ctx context.Context) (vo.Site, error) {
	u, e := a.DB.Stores().Owner(ctx, false)
	if e != nil {
		return vo.Site{}, e
	}
	site := DefaultSite()
	if e = json.Unmarshal(u.SiteSettings, &site); e != nil {
		return vo.Site{}, e
	}
	site.Version = u.SettingsVersion
	return site, nil
}
func (a *App) UpdateSite(ctx context.Context, in vo.Site) error {
	in.Name = strings.TrimSpace(in.Name)
	if len([]rune(in.Name)) < 1 || len([]rune(in.Name)) > 24 || len([]rune(in.EnglishName)) > 40 || len([]rune(in.Description)) > 120 {
		return db.ErrInvalid
	}
	err := a.DB.Within(ctx, func(s *db.Stores) error {
		owner, e := s.Owner(ctx, true)
		if e != nil {
			return e
		}
		if owner.SettingsVersion != in.Version {
			return db.ErrConflict
		}
		in.Version++
		if e = s.UpdateUser(ctx, owner.ID, map[string]interface{}{"site_settings": entity.Encode(in), "settings_version": in.Version}); e != nil {
			return e
		}
		return s.AppendAudit(ctx, audit.Event(ctx, enums.EventSettingsUpdate, enums.TargetSite, owner.ID, enums.ResultSuccess))
	})
	if err == nil {
		logCommittedOperation(ctx, enums.EventSettingsUpdate, enums.TargetSite, "")
	}
	return err
}
func (a *App) mutate(ctx context.Context, event enums.AuditEvent, target enums.AuditTarget, id string, fn func(*db.Stores) error) error {
	err := a.DB.Within(ctx, func(s *db.Stores) error {
		if e := fn(s); e != nil {
			return e
		}
		return s.AppendAudit(ctx, audit.Event(ctx, event, target, id, enums.ResultSuccess))
	})
	if err == nil {
		logCommittedOperation(ctx, event, target, id)
	}
	return err
}
func now() time.Time { return time.Now().UTC() }
