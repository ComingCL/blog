package db

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
	"log/slog"
	"nightlog/server/src/audit"
	"strings"
	"testing"
	"time"
)

func TestQueryLogsIgnoreExpectedMissesAndKeepFailuresWithoutSQL(t *testing.T) {
	var logs bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	defer slog.SetDefault(old)
	sql := func() (string, int64) { return "password=private-value", 0 }
	safeLogger{}.Trace(context.Background(), time.Now(), sql, gorm.ErrRecordNotFound)
	if logs.Len() != 0 {
		t.Fatal("normal not-found lookup must not emit database warnings")
	}
	safeLogger{}.Trace(context.Background(), time.Now(), sql, errors.New("password=private-value"))
	if !strings.Contains(logs.String(), "db_query") || !strings.Contains(logs.String(), "ERROR") || strings.Contains(logs.String(), "private-value") {
		t.Fatal("database failure must be observable and sanitized")
	}
}

func TestDatabaseFailureIncludesSafeCauseAndIdentity(t *testing.T) {
	var logs bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	defer slog.SetDefault(old)
	ctx := audit.With(context.Background(), audit.Meta{RequestID: "request-123", Route: "/v1/api/posts", ClientIP: "192.0.2.1", Username: "reader"})
	safeLogger{}.Trace(ctx, time.Now(), func() (string, int64) { return "SELECT private-value", 0 }, fmt.Errorf("private-value: %w", &pgconn.PgError{Code: "42P01", Message: "private-value"}))
	var entry map[string]any
	if err := json.Unmarshal(logs.Bytes(), &entry); err != nil {
		t.Fatal(err)
	}
	for key, want := range map[string]any{"request_id": "request-123", "route": "/v1/api/posts", "client_ip": "192.0.2.1", "username": "reader", "sqlstate": "42P01", "error_cause_type": "*pgconn.PgError"} {
		if entry[key] != want {
			t.Errorf("%s: want %v, got %v", key, want, entry[key])
		}
	}
	if strings.Contains(logs.String(), "private-value") {
		t.Fatal("query or error text leaked")
	}
}
