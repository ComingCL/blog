package db

import (
	"context"
	"gorm.io/gorm/clause"
	"nightlog/server/src/models/entity"
	"time"
)

func (s *Stores) UserByID(ctx context.Context, id string, lock bool) (*entity.User, error) {
	u := s.q.User
	do := u.WithContext(ctx).Where(u.ID.Eq(id))
	if lock {
		do = do.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	v, e := do.First()
	return v, normalize(e)
}
func (s *Stores) UserByName(ctx context.Context, name string) (*entity.User, error) {
	u := s.q.User
	v, e := u.WithContext(ctx).Where(u.Username.Eq(name)).First()
	return v, normalize(e)
}
func (s *Stores) CreateUser(ctx context.Context, u *entity.User) error {
	return normalize(s.q.User.WithContext(ctx).Create(u))
}
func (s *Stores) UpdateUser(ctx context.Context, id string, values map[string]interface{}) error {
	u := s.q.User
	values["updated_at"] = time.Now().UTC()
	_, e := u.WithContext(ctx).Where(u.ID.Eq(id)).Updates(values)
	return normalize(e)
}
func (s *Stores) Owner(ctx context.Context, lock bool) (*entity.User, error) {
	u := s.q.User
	do := u.WithContext(ctx).Where(u.IsSiteOwner.Is(true))
	if lock {
		do = do.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	v, e := do.First()
	return v, normalize(e)
}
func (s *Stores) AuthorNames(ctx context.Context, ids []string) (map[string]*entity.User, error) {
	u := s.q.User
	rows, e := u.WithContext(ctx).Where(u.ID.In(ids...)).Find()
	result := map[string]*entity.User{}
	for _, r := range rows {
		result[r.ID] = r
	}
	return result, e
}
