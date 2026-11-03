package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const validYAML = `server:
  port: 9090
  origin: "http://127.0.0.1:3100/"
database:
  dsn: "postgres://yaml-user:yaml-pass@localhost/blog?sslmode=disable"
security:
  audit_key: "01234567890123456789012345678901"
  cookie_secure: true
storage:
  path: "../data"
admin:
  username: "owner"
  password: "test-only-password"
`

func writeConfig(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadYAMLAndIgnoreEnvironment(t *testing.T) {
	t.Setenv("PORT", "1234")
	t.Setenv("DATABASE_URL", "must-not-be-used")
	t.Setenv("AUDIT_HASH_KEY", "must-not-be-used")
	path := writeConfig(t, validYAML)
	cfg, err := LoadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "9090" || cfg.DSN != "postgres://yaml-user:yaml-pass@localhost/blog?sslmode=disable" {
		t.Fatal("YAML values were overridden")
	}
	if cfg.APIOrigin != "http://127.0.0.1:9090" || cfg.Origin != "http://127.0.0.1:3100" {
		t.Fatal("origin defaults or normalization incorrect")
	}
	if !cfg.Secure || cfg.AdminUsername != "owner" || cfg.AdminPassword != "test-only-password" {
		t.Fatal("YAML fields not loaded")
	}
	if cfg.Storage != filepath.Clean(filepath.Join(filepath.Dir(path), "../data")) {
		t.Fatal("relative storage path is not based on configuration directory")
	}
}

func TestRejectInvalidYAMLConfiguration(t *testing.T) {
	cases := map[string]string{
		"unknown field":      validYAML + "typo_field: true\n",
		"multiple documents": validYAML + "---\nother: value\n",
		"duplicate field":    validYAML + "server: {}\n",
		"invalid port":       strings.Replace(validYAML, "port: 9090", "port: 70000", 1),
		"invalid origin":     strings.Replace(validYAML, "http://127.0.0.1:3100/", "https://user:password@example.com", 1),
		"empty database":     strings.Replace(validYAML, "postgres://yaml-user:yaml-pass@localhost/blog?sslmode=disable", "", 1),
		"short secret":       strings.Replace(validYAML, "01234567890123456789012345678901", "short", 1),
		"oversized file":     validYAML + strings.Repeat(" ", 65536),
	}
	for name, content := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := LoadFile(writeConfig(t, content)); err == nil {
				t.Fatal("invalid configuration accepted")
			}
		})
	}
}

func TestSharedContainerListenerConfiguration(t *testing.T) {
	content := strings.Replace(validYAML, "  port: 9090", "  port: 9090\n  web_host: 0.0.0.0\n  web_port: 3100", 1)
	if _, err := LoadFile(writeConfig(t, content)); err != nil {
		t.Fatalf("shared container listener configuration rejected: %v", err)
	}
	for _, invalid := range []string{
		strings.Replace(content, "web_port: 3100", "web_port: 70000", 1),
		strings.Replace(content, "web_host: 0.0.0.0", "web_host: example.com", 1),
	} {
		if _, err := LoadFile(writeConfig(t, invalid)); err == nil {
			t.Fatal("invalid listener accepted")
		}
	}
}
