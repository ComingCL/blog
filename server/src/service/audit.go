package service

import (
	"context"
	"log/slog"
	"nightlog/server/src/audit"
	"nightlog/server/src/infrastructure/db"
	"nightlog/server/src/models/dto"
	"nightlog/server/src/models/entity"
	"nightlog/server/src/models/enums"
	"nightlog/server/src/models/vo"
	"nightlog/server/src/models/vo/common"
	"regexp"
	"strings"
	"time"
)

var eventIDPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{8,80}$`)

func (a *App) RecordRead(ctx context.Context, event *entity.AuditLog) error {
	e := a.DB.Stores().AppendAudit(ctx, event)
	if e != nil && a.Spool != nil {
		return a.Spool.Save(event)
	}
	return e
}
func (a *App) RecordFailure(ctx context.Context, event enums.AuditEvent) {
	ev := audit.Event(ctx, event, enums.TargetRequest, "", enums.ResultFailure)
	ev.Category = enums.CategorySecurity
	if e := a.RecordRead(context.WithoutCancel(ctx), ev); e != nil {
		slog.Error("audit_failure_unrecorded", "request_id", audit.From(ctx).RequestID)
	}
}
func (a *App) Events(ctx context.Context, in dto.Events) error {
	if len(in.Events) < 1 || len(in.Events) > 20 {
		return db.ErrInvalid
	}
	meta := audit.From(ctx)
	return a.DB.Within(ctx, func(s *db.Stores) error {
		for _, item := range in.Events {
			if !eventIDPattern.MatchString(item.EventID) || !eventIDPattern.MatchString(item.VisitID) || !eventIDPattern.MatchString(item.PageViewID) || item.Seq < 1 || item.Seq > 10000 || item.DurationMs < 0 || item.DurationMs > 24*60*60*1000 || item.Progress < 0 || item.Progress > 100 || len(item.Path) > 300 || !strings.HasPrefix(item.Path, "/v1") || strings.ContainsAny(item.Path, "?#") {
				return db.ErrInvalid
			}
			if !item.EventType.IsClientEvent() {
				return db.ErrInvalid
			}
			if (item.EventType == enums.EventPageView || item.EventType == enums.EventArticleRead) && item.Seq != 1 {
				return db.ErrInvalid
			}
			if item.PostID != "" {
				p, e := s.PostByID(ctx, item.PostID, false)
				if e != nil || p.Status != enums.PostPublished {
					return db.ErrInvalid
				}
			}
			occurred, e := time.Parse(time.RFC3339, item.OccurredAt)
			if e != nil || occurred.Before(now().Add(-7*24*time.Hour)) || occurred.After(now().Add(5*time.Minute)) {
				return db.ErrInvalid
			}
			ev := audit.Event(ctx, item.EventType, enums.TargetPage, item.PostID, enums.ResultReceived)
			ev.EventID = "c-" + meta.VisitorID + "-" + item.EventID
			ev.Category = enums.CategoryBehavior
			ev.Source = enums.SourceClient
			ev.VisitID = item.VisitID
			ev.PageViewID = item.PageViewID
			ev.Seq = item.Seq
			ev.Route = item.Path
			ev.DurationMs = item.DurationMs
			ev.OccurredAt = occurred
			ev.Payload = entity.Encode(map[string]int{"progress": item.Progress})
			if e = s.AppendAudit(ctx, ev); e != nil {
				return e
			}
		}
		return nil
	})
}
func (a *App) Audits(ctx context.Context, p dto.Page) (common.PageData[vo.Audit], error) {
	rows, total, e := a.DB.Stores().Audits(ctx, p)
	if e != nil {
		return common.PageData[vo.Audit]{}, e
	}
	list := []vo.Audit{}
	for _, r := range rows {
		list = append(list, vo.Audit{ID: r.ID, EventType: r.EventType, Category: r.Category, Source: r.Source, ActorID: r.ActorID, Username: r.ActorUsername, ClientIP: r.ClientIP, VisitorID: r.VisitorID, VisitID: r.VisitID, RequestID: r.RequestID, TargetID: r.TargetID, Route: r.Route, Result: r.Result, DurationMs: r.DurationMs, OccurredAt: r.OccurredAt})
	}
	ev := audit.Event(ctx, enums.EventAuditView, enums.TargetAudit, "", enums.ResultSuccess)
	if e = a.RecordRead(ctx, ev); e != nil {
		return common.PageData[vo.Audit]{}, e
	}
	return common.Page(list, total, p.Page, p.Size), nil
}
