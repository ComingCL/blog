package service

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"golang.org/x/crypto/argon2"
	"nightlog/server/src/audit"
	"nightlog/server/src/infrastructure/db"
	"nightlog/server/src/models/dto"
	"nightlog/server/src/models/entity"
	"nightlog/server/src/models/enums"
	"nightlog/server/src/models/vo"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrUnauthorized = errors.New("unauthorized")
var userPattern = regexp.MustCompile(`^[a-z0-9_]{3,24}$`)

type Session struct {
	ID        string    `json:"id"`
	Hash      string    `json:"hash"`
	ExpiresAt time.Time `json:"expires_at"`
	Version   int64     `json:"version"`
}

func passwordHash(pass string) string {
	salt := []byte(audit.ID())
	hash := argon2.IDKey([]byte(pass), salt, 3, 64*1024, 2, 32)
	return "argon2id:" + base64.RawStdEncoding.EncodeToString(salt) + ":" + base64.RawStdEncoding.EncodeToString(hash)
}
func checkPassword(encoded, password string) bool {
	parts := strings.Split(encoded, ":")
	if len(parts) != 3 {
		return false
	}
	salt, e := base64.RawStdEncoding.DecodeString(parts[1])
	if e != nil {
		return false
	}
	want, e := base64.RawStdEncoding.DecodeString(parts[2])
	if e != nil || len(want) != 32 {
		return false
	}
	got := argon2.IDKey([]byte(password), salt, 3, 64*1024, 2, 32)
	return subtle.ConstantTimeCompare(want, got) == 1
}
func digest(value string) string { h := sha256.Sum256([]byte(value)); return hex.EncodeToString(h[:]) }
func validPassword(p string) bool {
	return utf8.RuneCountInString(p) >= 10 && utf8.RuneCountInString(p) <= 128 && len(p) <= 512
}
func (a *App) Register(ctx context.Context, in dto.Credentials, admin bool) (vo.User, error) {
	in.Username = strings.ToLower(strings.TrimSpace(in.Username))
	if !userPattern.MatchString(in.Username) || !validPassword(in.Password) {
		return vo.User{}, db.ErrInvalid
	}
	name := strings.TrimSpace(in.DisplayName)
	if name == "" {
		name = in.Username
	}
	if utf8.RuneCountInString(name) > 40 {
		return vo.User{}, db.ErrInvalid
	}
	role := enums.RoleReader
	if admin {
		role = enums.RoleAdmin
	}
	u := &entity.User{ID: audit.ID(), Username: in.Username, DisplayName: name, PasswordHash: passwordHash(in.Password), Role: role, IsSiteOwner: admin, Sessions: entity.Encode([]Session{}), SiteSettings: entity.Encode(DefaultSite()), SettingsVersion: 1, AuthVersion: 1, CreatedAt: now(), UpdatedAt: now()}
	m := audit.From(ctx)
	m.ActorID, m.Username = u.ID, u.Username
	ctx = audit.With(ctx, m)
	e := a.mutate(ctx, enums.EventRegister, enums.TargetUser, u.ID, func(s *db.Stores) error { return s.CreateUser(ctx, u) })
	return userVO(u), e
}
func (a *App) Login(ctx context.Context, in dto.Credentials) (vo.User, string, error) {
	name := strings.ToLower(strings.TrimSpace(in.Username))
	if len(in.Password) > 512 {
		return vo.User{}, "", ErrUnauthorized
	}
	u, e := a.DB.Stores().UserByName(ctx, name)
	if e != nil {
		if errors.Is(e, db.ErrNotFound) {
			checkPassword("argon2id:MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA:MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA", in.Password)
			return vo.User{}, "", ErrUnauthorized
		}
		return vo.User{}, "", e
	}
	if !checkPassword(u.PasswordHash, in.Password) {
		return vo.User{}, "", ErrUnauthorized
	}
	secret := audit.ID() + audit.ID()
	sid := audit.ID()
	token := u.ID + "." + sid + "." + secret
	e = a.DB.Within(ctx, func(s *db.Stores) error {
		current, e := s.UserByID(ctx, u.ID, true)
		if e != nil {
			return e
		}
		if current.PasswordHash != u.PasswordHash {
			return ErrUnauthorized
		}
		var sessions []Session
		if e = json.Unmarshal(current.Sessions, &sessions); e != nil {
			return e
		}
		active := []Session{}
		for _, v := range sessions {
			if v.ExpiresAt.After(now()) && v.Version == current.AuthVersion {
				active = append(active, v)
			}
		}
		if len(active) >= 5 {
			active = active[len(active)-4:]
		}
		active = append(active, Session{sid, digest(secret), now().Add(30 * 24 * time.Hour), current.AuthVersion})
		if e = s.UpdateUser(ctx, u.ID, map[string]interface{}{"sessions": entity.Encode(active)}); e != nil {
			return e
		}
		event := audit.Event(ctx, enums.EventLogin, enums.TargetUser, u.ID, enums.ResultSuccess)
		event.ActorID = u.ID
		event.ActorUsername = u.Username
		event.Category = enums.CategorySecurity
		return s.AppendAudit(ctx, event)
	})
	if e == nil {
		m := audit.From(ctx)
		m.ActorID, m.Username = u.ID, u.Username
		logCommittedOperation(audit.With(ctx, m), enums.EventLogin, enums.TargetUser, u.ID)
	}
	return userVO(u), token, e
}
func (a *App) Authenticate(ctx context.Context, token string) (vo.User, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 || len(token) > 256 {
		return vo.User{}, ErrUnauthorized
	}
	u, e := a.DB.Stores().UserByID(ctx, parts[0], false)
	if e != nil {
		if errors.Is(e, db.ErrNotFound) {
			return vo.User{}, ErrUnauthorized
		}
		return vo.User{}, e
	}
	var sessions []Session
	if json.Unmarshal(u.Sessions, &sessions) != nil {
		return vo.User{}, ErrUnauthorized
	}
	for _, v := range sessions {
		if v.ID == parts[1] && v.Version == u.AuthVersion && v.ExpiresAt.After(now()) && subtle.ConstantTimeCompare([]byte(v.Hash), []byte(digest(parts[2]))) == 1 {
			return userVO(u), nil
		}
	}
	return vo.User{}, ErrUnauthorized
}
func (a *App) Logout(ctx context.Context, userID, token string) error {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return ErrUnauthorized
	}
	return a.mutate(ctx, enums.EventLogout, enums.TargetUser, userID, func(s *db.Stores) error {
		u, e := s.UserByID(ctx, userID, true)
		if e != nil {
			return e
		}
		var sessions []Session
		if e = json.Unmarshal(u.Sessions, &sessions); e != nil {
			return e
		}
		active := []Session{}
		for _, v := range sessions {
			if v.ID != parts[1] {
				active = append(active, v)
			}
		}
		return s.UpdateUser(ctx, userID, map[string]interface{}{"sessions": entity.Encode(active)})
	})
}
func (a *App) Profile(ctx context.Context, id, name string) error {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > 40 {
		return db.ErrInvalid
	}
	return a.mutate(ctx, enums.EventProfile, enums.TargetUser, id, func(s *db.Stores) error { return s.UpdateUser(ctx, id, map[string]interface{}{"display_name": name}) })
}
func (a *App) ChangePassword(ctx context.Context, id string, in dto.Password) error {
	if !validPassword(in.Password) {
		return db.ErrInvalid
	}
	return a.mutate(ctx, enums.EventPassword, enums.TargetUser, id, func(s *db.Stores) error {
		u, e := s.UserByID(ctx, id, true)
		if e != nil {
			return e
		}
		if !checkPassword(u.PasswordHash, in.Current) {
			return ErrUnauthorized
		}
		return s.UpdateUser(ctx, id, map[string]interface{}{"password_hash": passwordHash(in.Password), "auth_version": u.AuthVersion + 1, "sessions": entity.Encode([]Session{})})
	})
}
