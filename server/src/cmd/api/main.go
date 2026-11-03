package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"nightlog/server/src/audit"
	"nightlog/server/src/config"
	"nightlog/server/src/infrastructure/db"
	"nightlog/server/src/logger"
	"nightlog/server/src/models/entity"
	"nightlog/server/src/router"
	"nightlog/server/src/service"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func main() {
	configPath := flag.String("config", "", "YAML configuration file (default: config/config.yaml)")
	migrate := flag.Bool("migrate", false, "apply reviewed initial schema")
	flag.Parse()
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cfg, e := config.LoadFile(*configPath)
	if e != nil {
		slog.Error("config_load_failed")
		os.Exit(1)
	}
	logs, e := logger.Init(filepath.Join(cfg.Storage, "logs"))
	if e != nil {
		slog.Error("logging unavailable")
		os.Exit(1)
	}
	defer logs.Close()
	database, e := db.Open(cfg.DSN)
	if e != nil {
		slog.Error("database connection failed")
		os.Exit(1)
	}
	defer database.Close()
	if *migrate {
		if e = database.Migrate(context.Background()); e != nil {
			slog.Error("migration failed")
			os.Exit(1)
		}
	}
	app := service.New(database)
	app.Spool, e = audit.NewSpool(filepath.Join(cfg.Storage, "audit-spool"))
	if e != nil {
		slog.Error("audit spool unavailable")
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				replayCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
				err := app.Spool.Replay(func(ev *entity.AuditLog) error { return database.Stores().AppendAudit(replayCtx, ev) })
				cancel()
				if err != nil {
					slog.Error("audit_replay_failed")
				}
			}
		}
	}()
	srv := &http.Server{Addr: "127.0.0.1:" + cfg.Port, Handler: router.New(app, cfg), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		slog.Info("api_listening", "address", srv.Addr)
		if e := srv.ListenAndServe(); e != nil && e != http.ErrServerClosed {
			slog.Error("api_start_failed")
			stop()
		}
	}()
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdown); err != nil {
		slog.Error("api_shutdown_failed")
	} else {
		slog.Info("api_stopped")
	}
}
