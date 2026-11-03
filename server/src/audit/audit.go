package audit

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"nightlog/server/src/models/entity"
	"nightlog/server/src/models/enums"
	"time"
)

type Meta struct {
	RequestID  string
	VisitorID  string
	VisitID    string
	PageViewID string
	ActorID    string
	Username   string
	ClientIP   string
	Route      string
	Method     string
	IPHash     string
	UserAgent  string
	CallSource enums.CallSource
}
type key struct{}

func With(ctx context.Context, m Meta) context.Context { return context.WithValue(ctx, key{}, m) }
func From(ctx context.Context) Meta                    { m, _ := ctx.Value(key{}).(Meta); return m }
func ID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func Event(ctx context.Context, event enums.AuditEvent, target enums.AuditTarget, id string, result enums.AuditResult) *entity.AuditLog {
	m := From(ctx)
	now := time.Now().UTC()
	return &entity.AuditLog{ID: ID(), EventID: ID(), EventType: event, Category: enums.CategoryAdmin, Source: enums.SourceServer, ActorID: m.ActorID, ActorUsername: m.Username, ClientIP: m.ClientIP, VisitorID: m.VisitorID, VisitID: m.VisitID, PageViewID: m.PageViewID, RequestID: m.RequestID, TargetType: target, TargetID: id, Route: m.Route, Method: m.Method, IPHash: m.IPHash, UserAgentSummary: m.UserAgent, Result: result, Payload: entity.Encode(map[string]any{"call_source": m.CallSource}), OccurredAt: now, ReceivedAt: now}
}
