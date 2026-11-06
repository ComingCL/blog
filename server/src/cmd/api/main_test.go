package main

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestStartupConfigurationFailureGoesToStderrWithoutSecrets(t *testing.T) {
	config := filepath.Join(t.TempDir(), "broken.yaml")
	if err := os.WriteFile(config, []byte("private-password: [invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(os.Args[0], "-test.run=^TestAPIStartupHelper$", "--", "-config", config)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err == nil {
		t.Fatal("invalid configuration must stop startup")
	}
	if !strings.Contains(stderr.String(), "config_load_failed") || stdout.Len() != 0 {
		t.Fatalf("pre-init failure must reach supervisor stderr log: stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
	if strings.Contains(stderr.String(), "private-password") {
		t.Fatal("configuration content leaked")
	}
}

func TestAPIStartupHelper(t *testing.T) {
	for index, arg := range os.Args {
		if arg == "--" {
			os.Args = append([]string{"blog-api"}, os.Args[index+1:]...)
			main()
			return
		}
	}
}
