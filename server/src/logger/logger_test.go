package logger

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestErrorLogContainsOnlyErrorsAndKeepsAttributes(t *testing.T) {
	previous := slog.Default()
	defer slog.SetDefault(previous)
	dir := t.TempDir()
	closer, err := Init(dir)
	if err != nil {
		t.Fatal(err)
	}
	slog.Info("healthy")
	slog.Warn("expected_rejection")
	slog.With("request_id", "request-123").WithGroup("failure").Error("request_failed", "code", "42703")
	if err := closer.Close(); err != nil {
		t.Fatal(err)
	}
	all, err := os.ReadFile(filepath.Join(dir, "application.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if len(strings.Split(strings.TrimSpace(string(all)), "\n")) != 3 {
		t.Fatal("all application records must be retained")
	}
	data, err := os.ReadFile(filepath.Join(dir, "error.jsonl"))
	if err != nil {
		t.Fatalf("dedicated physical error log unavailable: %v", err)
	}
	var entry map[string]any
	if err := json.Unmarshal(data, &entry); err != nil {
		t.Fatal(err)
	}
	if entry["level"] != "ERROR" || entry["msg"] != "request_failed" || entry["request_id"] != "request-123" {
		t.Fatalf("missing error identity: %v", entry)
	}
	if entry["failure"].(map[string]any)["code"] != "42703" {
		t.Fatal("group attributes were lost")
	}
	info, err := os.Stat(filepath.Join(dir, "error.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatal("error logs must be private")
	}
}

// Regression coverage for the existing rotation policy, now reused by error.jsonl.
func TestRotatingLogKeepsFiveBackups(t *testing.T) {
	path := filepath.Join(t.TempDir(), "error.jsonl")
	for i := 0; i < 7; i++ {
		file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY, 0600)
		if err != nil {
			t.Fatal(err)
		}
		// Sparse files exercise the real size boundary without writing 70 MiB.
		if err := file.Truncate(10 << 20); err != nil {
			t.Fatal(err)
		}
		file.Close()
		writer, err := openRotating(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write([]byte("next record\n")); err != nil {
			t.Fatal(err)
		}
		if err := writer.Close(); err != nil {
			t.Fatal(err)
		}
	}
	files, err := filepath.Glob(path + "*")
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 6 {
		t.Fatalf("want current log and five backups, got %d", len(files))
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "next record\n" {
		t.Fatal("new records must remain in the current log")
	}
	if _, err := os.Stat(path + ".5"); err != nil {
		t.Fatal("fifth backup missing")
	}
	if _, err := os.Stat(path + ".6"); !os.IsNotExist(err) {
		t.Fatal("rotation exceeded backup bound")
	}
}
