package service

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"nightlog/server/src/audit"
	"nightlog/server/src/models/enums"
	"testing"
)

func TestOperationLogsKeepCriticalIdentityAndSilenceAutosave(t *testing.T) {
	var output bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	defer slog.SetDefault(old)
	ctx := audit.With(context.Background(), audit.Meta{RequestID: "req-1", ClientIP: "203.0.113.8", ActorID: "u1", Username: "owner"})
	logCommittedOperation(ctx, enums.EventDraftSave, enums.TargetPost, "post-1")
	if output.Len() != 0 {
		t.Fatal("autosave should remain in durable audit, not produce extra business logs")
	}
	logCommittedOperation(ctx, enums.EventPostPublish, enums.TargetPost, "post-1")
	var row map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &row); err != nil {
		t.Fatal("missing committed operation log")
	}
	if row["event_type"] != "post.publish" || row["client_ip"] != "203.0.113.8" || row["username"] != "owner" || row["target_id"] != "post-1" {
		t.Fatalf("missing diagnostic context: %v", row)
	}
}
