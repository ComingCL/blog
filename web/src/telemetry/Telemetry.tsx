"use client";
import { AuditEvent } from "@/models/enums";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { toPublicPath } from "@/router";
type Event = {
  event_id: string;
  event_type: AuditEvent;
  visit_id: string;
  page_view_id: string;
  seq: number;
  path: string;
  post_id: string;
  duration_ms: number;
  progress: number;
  occurred_at: string;
};
const key = "nightlog.pending-events";
function getQueue(): Event[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]") as Event[];
    return Array.isArray(v)
      ? v.filter((x) => Date.now() - Date.parse(x.occurred_at) < 7 * 86400000).slice(-80)
      : [];
  } catch {
    return [];
  }
}
function store(q: Event[]) {
  try {
    localStorage.setItem(key, JSON.stringify(q.slice(-80)));
  } catch {}
}
async function flush() {
  const q = getQueue();
  if (!q.length) return;
  const batch = q.slice(0, 20);
  try {
    await api(endpoints.events, {
      method: "POST",
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
    const sent = new Set(batch.map((x) => x.event_id));
    store(getQueue().filter((x) => !sent.has(x.event_id)));
  } catch {
    /* Keep bounded events for a later route navigation or online retry. */
  }
}
export function Telemetry() {
  const pathname = usePathname();
  useEffect(() => {
    let id = crypto.randomUUID(),
      last = Date.now();
    try {
      const v = JSON.parse(sessionStorage.getItem("nightlog.visit") || "null");
      if (v && Date.now() - v.time < 1800000) id = v.id;
      sessionStorage.setItem("nightlog.visit", JSON.stringify({ id, time: last }));
    } catch {}
    const pageID = crypto.randomUUID();
    const path = pathname.startsWith("/v1") ? pathname : toPublicPath(pathname);
    let duration = 0,
      progress = 0,
      seq = 1,
      read = false;
    const article = document.querySelector("[data-post-id]");
    const postID = article?.getAttribute("data-post-id") || "";
    const enqueue = (event_type: AuditEvent, n: number) => {
      const q = getQueue();
      q.push({
        event_id: crypto.randomUUID(),
        event_type,
        visit_id: id,
        page_view_id: pageID,
        seq: n,
        path,
        post_id: postID,
        duration_ms: Math.round(duration),
        progress,
        occurred_at: new Date().toISOString(),
      });
      store(q);
    };
    let viewed = false;
    const tick = () => {
      const now = Date.now();
      if (!document.hidden) {
        duration += Math.max(0, Math.min(now - last, 2000));
        if (!viewed) {
          viewed = true;
          enqueue(AuditEvent.PageView, 1);
        }
        if (postID && duration > 5000 && !read) {
          read = true;
          enqueue(AuditEvent.ArticleRead, 1);
        }
      }
      last = now;
    };
    tick();
    const timer = setInterval(tick, 1000);
    const heartbeat = setInterval(() => {
      enqueue(AuditEvent.Engagement, seq++);
      void flush();
    }, 30000);
    const scroll = () => {
      progress = Math.max(
        progress,
        Math.min(
          100,
          Math.round(
            ((scrollY + innerHeight) / Math.max(document.documentElement.scrollHeight, 1)) * 100,
          ),
        ),
      );
    };
    const hide = () => {
      tick();
      enqueue(AuditEvent.Engagement, seq++);
      void flush();
    };
    const online = () => void flush();
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", hide);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", hide);
    void flush();
    return () => {
      tick();
      enqueue(AuditEvent.Engagement, seq++);
      void flush();
      clearInterval(timer);
      clearInterval(heartbeat);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [pathname]);
  return null;
}
