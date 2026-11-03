package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"nightlog/server/src/audit"
	"nightlog/server/src/config"
	"nightlog/server/src/infrastructure/db"
	"nightlog/server/src/models/dto"
	"nightlog/server/src/service"
	"os"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	configPath := flag.String("config", "", "YAML configuration file (default: config/config.yaml)")
	name := flag.String("username", "", "override administrator username from YAML")
	migrate := flag.Bool("migrate", false, "apply initial migration")
	ifMissing := flag.Bool("if-missing", false, "preserve an existing site administrator during deployment")
	flag.Parse()
	cfg, e := config.LoadFile(*configPath)
	if e != nil {
		fmt.Fprintln(os.Stderr, "invalid YAML configuration; check the private configuration file")
		os.Exit(1)
	}
	database, e := db.Open(cfg.DSN)
	if e != nil {
		fmt.Fprintln(os.Stderr, "database unavailable")
		os.Exit(1)
	}
	defer database.Close()
	if *migrate {
		if e = database.Migrate(context.Background()); e != nil {
			fmt.Fprintln(os.Stderr, e)
			os.Exit(1)
		}
	}
	password := cfg.AdminPassword
	if *name == "" {
		*name = cfg.AdminUsername
	}
	if password == "" {
		fmt.Fprintln(os.Stderr, "set admin.password in the YAML configuration (at least 10 characters)")
		os.Exit(1)
	}
	ctx := audit.With(context.Background(), audit.Meta{RequestID: audit.ID(), Method: "CLI", Route: "admin.bootstrap"})
	app := service.New(database)
	created := true
	in := dto.Credentials{Username: *name, Password: password, DisplayName: "博主"}
	if *ifMissing {
		created, e = app.BootstrapAdmin(ctx, in)
	} else {
		_, e = app.Register(ctx, in, true)
	}
	if e != nil {
		fmt.Fprintln(os.Stderr, "administrator initialization failed; check username, database and configuration")
		os.Exit(1)
	}
	slog.Info("administrator_bootstrap_completed", "created", created)
}
