"""Build the self-contained UI preview and inline conversation fragment."""

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
image = base64.b64encode((ROOT / "docs/assets/rainy-night-poster.jpg").read_bytes()).decode()
motion = base64.b64encode((ROOT / "docs/assets/rainy-night-loop.mp4").read_bytes()).decode()
fragment = (ROOT / "prototype/ui.fragment.html").read_text().replace(
    "__HERO__", f"data:image/jpeg;base64,{image}"
).replace("__MOTION__", f"data:video/mp4;base64,{motion}")
assert len(fragment.encode()) < 1_000_000
(ROOT / "prototype/preview.fragment.html").write_text(fragment)
(ROOT / "prototype/index.html").write_text(
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1">'
    '<title>夜航 · 博客 UI 设计预览</title>'
    '<style>html,body{margin:0;padding:0;width:100%;background:#0c0d10;}'
    'body #nightlog{width:100%;max-width:none;min-height:100svh;border-radius:0;}'
    'body #nightlog .nl-hero{min-height:calc(100svh - 84px);}'
    'body #nightlog .nl-page{width:100%;max-width:1320px;margin-inline:auto;}'
    'body #nightlog .nl-reading{width:100%;max-width:1200px;margin-inline:auto;}'
    'body #nightlog .nl-admin{flex:1;min-height:calc(100svh - 150px);}'
    '@media(max-width:600px){body #nightlog .nl-hero{min-height:calc(100svh - 120px);}}'
    '</style></head><body>'
    + fragment
    + '</body></html>'
)
print("Built prototype/index.html and prototype/preview.fragment.html")
