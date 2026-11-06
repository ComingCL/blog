package response

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"nightlog/server/src/audit"
	"nightlog/server/src/infrastructure/db"
)

func TestInternalFailureLogsSafeCauseAndRequestIdentity(t *testing.T) {
	var logs bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	defer slog.SetDefault(old)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest("GET", "/v1/api/posts?password=never-log", nil)
	c.Request = c.Request.WithContext(audit.With(context.Background(), audit.Meta{RequestID: "request-123", Route: "/v1/api/posts", Method: "GET", ClientIP: "192.0.2.1", ActorID: "user-123", Username: "reader"}))
	c.Set("request_id", "request-123")
	Error(c, fmt.Errorf("load posts password=never-log: %w", &pgconn.PgError{Code: "42703", Message: "secret SQL and password=never-log", Detail: "private-row-content"}))
	var entry map[string]any
	if err := json.Unmarshal(logs.Bytes(), &entry); err != nil {
		t.Fatal(err)
	}
	for key, want := range map[string]any{"request_id": "request-123", "route": "/v1/api/posts", "method": "GET", "client_ip": "192.0.2.1", "username": "reader", "user_id": "user-123", "sqlstate": "42703", "error_cause_type": "*pgconn.PgError"} {
		if entry[key] != want {
			t.Errorf("%s: want %v, got %v", key, want, entry[key])
		}
	}
	if strings.Contains(logs.String()+rec.Body.String(), "never-log") || strings.Contains(logs.String(), "private-row-content") {
		t.Fatal("sensitive error text leaked")
	}
	if rec.Code != 500 || !strings.Contains(rec.Body.String(), "INTERNAL_ERROR") {
		t.Fatalf("unexpected public response: %s", rec.Body.String())
	}
}

func TestExpectedFailureDoesNotEmitInternalError(t *testing.T) {
	var logs bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	defer slog.SetDefault(old)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("GET", "/v1/api/posts/missing", nil)
	Error(c, db.ErrNotFound)
	if logs.Len() != 0 {
		t.Fatal("normal missing content must not be logged as an internal failure")
	}
}
