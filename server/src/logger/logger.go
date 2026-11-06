package logger

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
)

type rotating struct {
	mu   sync.Mutex
	path string
	file *os.File
	size int64
}

func (r *rotating) Write(b []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.size+int64(len(b)) > 10<<20 {
		if e := r.file.Close(); e != nil {
			return 0, e
		}
		for i := 4; i >= 1; i-- {
			_ = os.Rename(fmt.Sprintf("%s.%d", r.path, i), fmt.Sprintf("%s.%d", r.path, i+1))
		}
		_ = os.Rename(r.path, r.path+".1")
		f, e := os.OpenFile(r.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if e != nil {
			return 0, e
		}
		r.file = f
		r.size = 0
	}
	n, e := r.file.Write(b)
	r.size += int64(n)
	if e == nil {
		e = r.file.Sync()
	}
	return n, e
}
func Init(dir string) (io.Closer, error) {
	if e := os.MkdirAll(dir, 0700); e != nil {
		return nil, e
	}
	application, e := openRotating(filepath.Join(dir, "application.jsonl"))
	if e != nil {
		return nil, e
	}
	failures, e := openRotating(filepath.Join(dir, "error.jsonl"))
	if e != nil {
		application.Close()
		return nil, e
	}
	slog.SetDefault(slog.New(fanout{
		slog.NewJSONHandler(io.MultiWriter(os.Stdout, application), &slog.HandlerOptions{AddSource: true}),
		slog.NewJSONHandler(failures, &slog.HandlerOptions{Level: slog.LevelError, AddSource: true}),
	}))
	return logFiles{application, failures}, nil
}

func openRotating(path string) (*rotating, error) {
	f, e := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if e != nil {
		return nil, e
	}
	info, e := f.Stat()
	if e != nil {
		f.Close()
		return nil, e
	}
	return &rotating{path: path, file: f, size: info.Size()}, nil
}
func (r *rotating) Close() error { r.mu.Lock(); defer r.mu.Unlock(); return r.file.Close() }

type logFiles []*rotating

func (files logFiles) Close() error {
	var result error
	for _, file := range files {
		result = errors.Join(result, file.Close())
	}
	return result
}

// Each destination keeps its own level filter, attributes and groups.
type fanout []slog.Handler

func (handlers fanout) Enabled(ctx context.Context, level slog.Level) bool {
	for _, handler := range handlers {
		if handler.Enabled(ctx, level) {
			return true
		}
	}
	return false
}
func (handlers fanout) Handle(ctx context.Context, record slog.Record) error {
	var result error
	for _, handler := range handlers {
		if handler.Enabled(ctx, record.Level) {
			result = errors.Join(result, handler.Handle(ctx, record.Clone()))
		}
	}
	return result
}
func (handlers fanout) WithAttrs(attrs []slog.Attr) slog.Handler {
	result := make(fanout, len(handlers))
	for i, handler := range handlers {
		result[i] = handler.WithAttrs(attrs)
	}
	return result
}
func (handlers fanout) WithGroup(name string) slog.Handler {
	result := make(fanout, len(handlers))
	for i, handler := range handlers {
		result[i] = handler.WithGroup(name)
	}
	return result
}
