"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./Providers";
import { routes, BASE } from "@/router";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { Typewriter } from "./Typewriter";
export function Hero() {
  const { site } = useApp();
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion:reduce)");
    const update = () => setReduced(q.matches);
    update();
    q.addEventListener("change", update);
    return () => q.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let visible = true;
    const sync = () => {
      if (paused || reduced || !site.hero_motion_enabled || document.hidden || !visible)
        video.pause();
      else void video.play().catch(() => setPaused(true));
    };
    const obs = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      sync();
    });
    obs.observe(video);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      obs.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [paused, reduced, site.hero_motion_enabled]);
  return (
    <section className="nl-hero">
      {site.hero_motion_enabled && !reduced && (
        <video
          ref={ref}
          className="nl-hero-video"
          src={`${BASE}/images/rainy-night-loop.mp4`}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          aria-hidden="true"
        />
      )}
      <div className="nl-eyebrow nl-hero-eyebrow">
        <span /> 山川远阔 · 人间烟火 <span />
      </div>
      <Typewriter />
      <p className="nl-hero-description">{site.description}</p>
      <div className="nl-actions">
        <Link className="nl-btn nl-btn-glass" href={routes.posts}>
          翻开一页 <ArrowUpRight size={16} />
        </Link>
        <Link className="nl-btn nl-hero-secondary" href={routes.guestbook}>
          留一句话
        </Link>
      </div>
      <a className="nl-scroll-note" href="#recent-stories">
        <span>往下，是生活的另一页</span>
        <ArrowDown size={16} strokeWidth={1.2} />
      </a>
      {site.hero_motion_enabled && !reduced && (
        <button
          className="nl-motion-control"
          aria-pressed={!paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? "播放背景" : "暂停背景"}
        </button>
      )}
    </section>
  );
}
