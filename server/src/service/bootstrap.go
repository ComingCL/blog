package service

import (
	"context"
	"errors"
	"nightlog/server/src/infrastructure/db"
	"nightlog/server/src/models/dto"
	"nightlog/server/src/models/enums"
)

// BootstrapAdmin creates only the first site owner; repeats preserve the existing password.
func (a *App) BootstrapAdmin(ctx context.Context, in dto.Credentials) (bool, error) {
	owner, err := a.DB.Stores().Owner(ctx, false)
	if err == nil {
		if owner.Username != in.Username || owner.Role != enums.RoleAdmin {
			return false, db.ErrConflict
		}
		return false, nil
	}
	if !errors.Is(err, db.ErrNotFound) {
		return false, err
	}
	_, err = a.Register(ctx, in, true)
	// A concurrent bootstrap can win the owner uniqueness constraint.
	if errors.Is(err, db.ErrConflict) {
		owner, lookup := a.DB.Stores().Owner(ctx, false)
		if lookup == nil && owner.Username == in.Username && owner.Role == enums.RoleAdmin {
			return false, nil
		}
	}
	return err == nil, err
}
