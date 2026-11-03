package config

import (
	"errors"
	"fmt"
	"io"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config contains validated process configuration loaded exclusively from YAML.
// Do not serialize it into responses or logs: it contains private credentials.
type Config struct {
	DSN, Port, Origin, APIOrigin, AuditKey, Storage string
	AdminUsername, AdminPassword                    string
	Secure                                          bool
}

type fileConfig struct {
	Server struct {
		Port           int      `yaml:"port"`
		Origin         string   `yaml:"origin"`
		APIOrigin      string   `yaml:"api_origin"`
		TrustedProxies []string `yaml:"trusted_proxies"`
		WebHost        string   `yaml:"web_host"`
		WebPort        int      `yaml:"web_port"`
	} `yaml:"server"`
	Database struct {
		DSN string `yaml:"dsn"`
	} `yaml:"database"`
	Security struct {
		AuditKey     string `yaml:"audit_key"`
		CookieSecure bool   `yaml:"cookie_secure"`
	} `yaml:"security"`
	Storage struct {
		Path string `yaml:"path"`
	} `yaml:"storage"`
	Admin struct {
		Username string `yaml:"username"`
		Password string `yaml:"password"`
	} `yaml:"admin"`
}

func Load() (Config, error) { return LoadFile("") }

// LoadFile uses the requested file, or locates config/config.yaml from server,
// the repository root, or the compiled executable's location. No env overrides.
func LoadFile(path string) (Config, error) {
	var result Config
	if path == "" {
		candidates := []string{"config/config.yaml", "server/config/config.yaml"}
		if executable, err := os.Executable(); err == nil {
			candidates = append(candidates, filepath.Join(filepath.Dir(executable), "../config/config.yaml"))
		}
		for _, candidate := range candidates {
			if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
				path = candidate
				break
			}
		}
		if path == "" {
			return result, errors.New("config/config.yaml not found; run python3 scripts/setup.py or specify -config")
		}
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return result, fmt.Errorf("resolve YAML configuration: %w", err)
	}
	file, err := os.Open(absolute)
	if err != nil {
		return result, fmt.Errorf("open YAML configuration: %w", err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return result, fmt.Errorf("stat YAML configuration: %w", err)
	}
	if info.Size() > 64<<10 {
		return result, errors.New("YAML configuration exceeds 64 KiB")
	}
	var raw fileConfig
	raw.Server.Port = 8080
	raw.Server.WebHost = "127.0.0.1"
	raw.Server.Origin = "http://127.0.0.1:3100"
	raw.Storage.Path = "../storage"
	raw.Admin.Username = "admin"
	decoder := yaml.NewDecoder(io.LimitReader(file, 64<<10))
	decoder.KnownFields(true)
	if err = decoder.Decode(&raw); err != nil {
		return result, fmt.Errorf("decode YAML configuration: %w", err)
	}
	var extra any
	if err = decoder.Decode(&extra); err != io.EOF {
		return result, errors.New("configuration must contain exactly one YAML document")
	}
	if raw.Server.Port < 1 || raw.Server.Port > 65535 {
		return result, errors.New("server.port must be between 1 and 65535")
	}
	if _, err := netip.ParseAddr(raw.Server.WebHost); err != nil {
		return result, errors.New("server.web_host must be an IP address")
	}
	if raw.Server.WebPort < 0 || raw.Server.WebPort > 65535 {
		return result, errors.New("server.web_port must be between 1 and 65535 when specified")
	}
	if strings.TrimSpace(raw.Database.DSN) == "" {
		return result, errors.New("database.dsn is required")
	}
	if len(raw.Security.AuditKey) < 32 {
		return result, errors.New("security.audit_key must contain at least 32 bytes")
	}
	if raw.Server.APIOrigin == "" {
		raw.Server.APIOrigin = "http://127.0.0.1:" + strconv.Itoa(raw.Server.Port)
	}
	for _, origin := range []string{raw.Server.Origin, raw.Server.APIOrigin} {
		parsed, err := url.Parse(origin)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
			return result, errors.New("server.origin and server.api_origin must be HTTP(S) origins without credentials or paths")
		}
	}
	for _, proxy := range raw.Server.TrustedProxies {
		if _, err := netip.ParseAddr(proxy); err != nil {
			if _, err := netip.ParsePrefix(proxy); err != nil {
				return result, errors.New("server.trusted_proxies must contain valid IP addresses or CIDRs")
			}
		}
	}
	if strings.TrimSpace(raw.Storage.Path) == "" {
		return result, errors.New("storage.path is required")
	}
	storage := raw.Storage.Path
	if !filepath.IsAbs(storage) {
		storage = filepath.Join(filepath.Dir(absolute), storage)
	}
	return Config{
		DSN: raw.Database.DSN, Port: strconv.Itoa(raw.Server.Port),
		Origin: strings.TrimRight(raw.Server.Origin, "/"), APIOrigin: strings.TrimRight(raw.Server.APIOrigin, "/"),
		AuditKey: raw.Security.AuditKey, Storage: filepath.Clean(storage), Secure: raw.Security.CookieSecure,
		AdminUsername: raw.Admin.Username, AdminPassword: raw.Admin.Password,
	}, nil
}
