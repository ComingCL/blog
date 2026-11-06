#!/usr/bin/env python3
"""Exercise published Markdown through a disposable local production deployment.

Usage: python3 scripts/smoke_deployment.py deploy/runtime/error-smoke
Only a loopback deployment with a project name ending in -smoke is accepted.
Creates an article via authenticated APIs; remove the isolated stack afterwards.
"""
import json
import sys
from http.cookiejar import CookieJar
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener


def check(directory):
    state = json.loads((directory / "state.json").read_text())
    origin = state["origin"]
    url = urlsplit(origin)
    if (url.scheme != "http" or url.hostname != "127.0.0.1" or not url.port
            or url.port < 1024 or not state["project"].endswith("-smoke")):
        raise ValueError("Only disposable loopback *-smoke deployments may be modified")
    opener = build_opener(HTTPCookieProcessor(CookieJar()))

    def api(path, method="GET", data=None):
        headers = {"Origin": origin, "Content-Type": "application/json"}
        if method != "GET":
            headers["X-CSRF-Token"] = api("/auth/csrf")["token"]
        request = Request(origin + "/v1/api" + path,
                          data=json.dumps(data).encode() if data is not None else None,
                          headers=headers, method=method)
        with opener.open(request, timeout=15) as response:
            envelope = json.load(response)
        assert envelope["code"] == "OK", "API returned a non-success code"
        return envelope["data"]

    config = json.loads((directory / "config.yaml").read_text())
    api("/auth/login", "POST", config["admin"])
    post_id = api("/admin/posts", "POST")["id"]
    path = "/admin/posts/" + post_id
    draft = api(path + "/draft")
    slug = "smoke-" + post_id
    markdown = "## Smoke article\n\nSMOKE_BODY_VISIBLE\n\n[Ordinary link](https://example.com)\n\n[Video](https://example.com/movie.mp4)\n\n![Image](https://example.com/image.png)"
    api(path + "/draft", "PATCH", {
        "title": "Smoke article", "slug": slug, "excerpt": "Smoke deployment check",
        "markdown": markdown, "category": "Test", "tags": [], "cover_url": "",
        "version": draft["version"], "post_version": draft["post_version"],
    })
    draft = api(path + "/draft")
    api(path + "/publish", "POST", {"version": draft["version"], "post_version": draft["post_version"]})
    assert api("/posts/" + slug)["markdown"] == markdown, "Published API lost Markdown"
    # Fresh anonymous request checks the actual production SSR path, not only API JSON.
    visitor = build_opener()
    with visitor.open(origin + "/v1/posts/" + slug, timeout=20) as response:
        html = response.read().decode()
        assert response.status == 200, "Article SSR failed"
    assert 'data-post-id="' + post_id + '"' in html, "Article markup missing"
    assert "SMOKE_BODY_VISIBLE" in html, "Article body missing"
    assert 'href="https://example.com"' in html, "Ordinary Markdown link missing"
    assert "暂时没能取回这些文字" not in html, "Article rendered error fallback"
    print("PASS: authenticated create/save/publish, anonymous API and production Markdown SSR")


if __name__ == "__main__":
    check(Path(sys.argv[1]))
