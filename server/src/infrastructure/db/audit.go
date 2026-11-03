package db

import (
	"context"
	"gorm.io/gorm/clause"
	"nightlog/server/src/models/dto"
	"nightlog/server/src/models/entity"
)

func (s *Stores) AppendAudit(ctx context.Context, e *entity.AuditLog) error {
	return s.q.AuditLog.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(e)
}
func (s *Stores) Audits(ctx context.Context, p dto.Page) ([]*entity.AuditLog, int64, error) {
	a := s.q.AuditLog
	do := a.WithContext(ctx)
	if p.EventType != "" {
		do = do.Where(a.EventType.Eq(string(p.EventType)))
	}
	if p.Username != "" {
		do = do.Where(a.ActorUsername.Eq(p.Username))
	}
	if p.ClientIP != "" {
		do = do.Where(a.ClientIP.Eq(p.ClientIP))
	}
	if p.ActorID != "" {
		do = do.Where(a.ActorID.Eq(p.ActorID))
	}
	if p.VisitID != "" {
		do = do.Where(a.VisitID.Eq(p.VisitID))
	}
	total, e := do.Count()
	if e != nil {
		return nil, 0, e
	}
	rows, e := do.Order(a.OccurredAt.Desc(), a.ID.Desc()).Offset(p.Offset()).Limit(p.Size).Find()
	return rows, total, e
}
