package logger

import (
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
	path := filepath.Join(dir, "application.jsonl")
	f, e := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if e != nil {
		return nil, e
	}
	info, e := f.Stat()
	if e != nil {
		f.Close()
		return nil, e
	}
	r := &rotating{path: path, file: f, size: info.Size()}
	slog.SetDefault(slog.New(slog.NewJSONHandler(io.MultiWriter(os.Stdout, r), nil)))
	return r, nil
}
func (r *rotating) Close() error { r.mu.Lock(); defer r.mu.Unlock(); return r.file.Close() }
