package storage

import (
	"bytes"
	"fmt"
	_ "golang.org/x/image/webp"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	_ "image/png"
	"io"
	"nightlog/server/src/audit"
	"os"
	"path/filepath"
)

func SaveImage(dir string, r io.Reader) (string, error) {
	data, e := io.ReadAll(io.LimitReader(r, (10<<20)+1))
	if e != nil {
		return "", e
	}
	if len(data) > 10<<20 {
		return "", fmt.Errorf("image too large")
	}
	cfg, format, e := image.DecodeConfig(bytes.NewReader(data))
	if e != nil || cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width > 12000 || cfg.Height > 12000 || int64(cfg.Width)*int64(cfg.Height) > 30000000 {
		return "", fmt.Errorf("invalid image")
	}
	if format != "jpeg" && format != "png" && format != "webp" {
		return "", fmt.Errorf("unsupported image")
	}
	img, _, e := image.Decode(bytes.NewReader(data))
	if e != nil {
		return "", e
	}
	canvas := image.NewRGBA(img.Bounds())
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{color.White}, image.Point{}, draw.Src)
	draw.Draw(canvas, canvas.Bounds(), img, img.Bounds().Min, draw.Over)
	if e = os.MkdirAll(dir, 0750); e != nil {
		return "", e
	}
	key := audit.ID() + ".jpg"
	f, e := os.OpenFile(filepath.Join(dir, key), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0640)
	if e != nil {
		return "", e
	}
	if e = jpeg.Encode(f, canvas, &jpeg.Options{Quality: 85}); e != nil {
		f.Close()
		os.Remove(f.Name())
		return "", e
	}
	if e = f.Close(); e != nil {
		return "", e
	}
	return key, nil
}
