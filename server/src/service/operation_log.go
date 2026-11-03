package service

import (
	"context"
	"log/slog"
	"nightlog/server/src/audit"
	"nightlog/server/src/models/enums"
)

// Called after the transaction returns nil; durable audit still records every mutation.
func logCommittedOperation(ctx context.Context, event enums.AuditEvent, target enums.AuditTarget, id string) {
	switch event {
	case enums.EventRegister, enums.EventLogin, enums.EventLogout, enums.EventPassword,
		enums.EventPostPublish, enums.EventPostUnpublish, enums.EventPostTrash, enums.EventPostRestore,
		enums.EventPostPurge, enums.EventSettingsUpdate, enums.EventCommentModerate:
		m := audit.From(ctx)
		slog.InfoContext(ctx, "operation_committed", "event_type", event, "target_type", target, "target_id", id,
			"request_id", m.RequestID, "user_id", m.ActorID, "username", m.Username, "client_ip", m.ClientIP)
	}
}
