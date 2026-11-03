package db

import (
	"bytes"
	"context"
	"errors"
	"gorm.io/gorm"
	"log/slog"
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
