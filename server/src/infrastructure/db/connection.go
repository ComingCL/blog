package db

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"log/slog"
	"nightlog/server/src/audit"
	"nightlog/server/src/infrastructure/db/query"
	appLogger "nightlog/server/src/logger"
	"strings"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

//go:embed migrations/*.sql
var migrations embed.FS

var ErrNotFound = errors.New("not found")
var ErrConflict = errors.New("version conflict")
var ErrForbidden = errors.New("forbidden")
var ErrInvalid = errors.New("invalid input")

type Database struct{ conn *gorm.DB }
type Stores struct{ q *query.Query }

func NewStores(q *query.Query) *Stores { return &Stores{q: q} }
func Open(dsn string) (*Database, error) {
	conn, err := gorm.Open(postgres.Open(dsn), &gorm.Config{TranslateError: true, Logger: safeLogger{}})
	if err != nil {
		return nil, err
	}
	raw, err := conn.DB()
	if err != nil {
		return nil, err
	}
	raw.SetMaxOpenConns(15)
	raw.SetMaxIdleConns(5)
	raw.SetConnMaxLifetime(30 * time.Minute)
	return &Database{conn: conn}, nil
}

// safeLogger logs timing and row counts without SQL strings or bound credentials.
type safeLogger struct{}

func (safeLogger) LogMode(logger.LogLevel) logger.Interface      { return safeLogger{} }
func (safeLogger) Info(context.Context, string, ...interface{})  {}
func (safeLogger) Warn(context.Context, string, ...interface{})  {}
func (safeLogger) Error(context.Context, string, ...interface{}) {}
func (safeLogger) Trace(ctx context.Context, begin time.Time, fc func() (string, int64), err error) {
	duration := time.Since(begin)
	if duration < time.Second && (errors.Is(err, gorm.ErrRecordNotFound) || errors.Is(err, gorm.ErrDuplicatedKey)) {
		return
	}
	if err == nil && duration < time.Second {
		return
	}
	_, rows := fc()
	level := slog.LevelWarn
	if err != nil {
		level = slog.LevelError
	}
	meta := audit.From(ctx)
	fields := []any{"request_id", meta.RequestID, "route", meta.Route, "client_ip", meta.ClientIP,
		"user_id", meta.ActorID, "username", meta.Username, "duration_ms", duration.Milliseconds(), "rows", rows, "failed", err != nil}
	if err != nil {
		fields = append(fields, appLogger.FailureFields(err)...)
	}
	slog.Log(ctx, level, "db_query", fields...)
}
func (d *Database) Stores() *Stores { return NewStores(query.Use(d.conn)) }
func (d *Database) Within(ctx context.Context, fn func(*Stores) error) error {
	return query.Use(d.conn.WithContext(ctx)).Transaction(func(q *query.Query) error { return fn(NewStores(q)) })
}
func (d *Database) Ping(ctx context.Context) error {
	raw, err := d.conn.DB()
	if err != nil {
		return err
	}
	return raw.PingContext(ctx)
}
func (d *Database) Close() error {
	raw, err := d.conn.DB()
	if err != nil {
		return err
	}
	return raw.Close()
}
func (d *Database) Migrate(ctx context.Context) error {
	started := time.Now()
	files, err := migrations.ReadDir("migrations")
	if err != nil {
		return err
	}
	err = d.conn.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("SELECT pg_advisory_xact_lock(91724001)").Error; err != nil {
			return err
		}
		// ReadDir is sorted by filename. Migrations are idempotent to keep the
		// six-table constraint without adding a framework migration table.
		for _, file := range files {
			if file.IsDir() || !strings.HasSuffix(file.Name(), ".sql") {
				continue
			}
			b, err := migrations.ReadFile("migrations/" + file.Name())
			if err != nil {
				return err
			}
			if err := tx.Exec(string(b)).Error; err != nil {
				return fmt.Errorf("migration %s: %w", file.Name(), err)
			}
		}
		return nil
	})
	if err != nil {
		slog.ErrorContext(ctx, "migration_failed", "duration_ms", time.Since(started).Milliseconds())
	} else {
		slog.InfoContext(ctx, "migration_completed", "duration_ms", time.Since(started).Milliseconds())
	}
	return err
}
func normalize(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return ErrConflict
	}
	return err
}
