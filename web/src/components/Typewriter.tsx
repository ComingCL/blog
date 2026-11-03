"use client";
import { useEffect, useState } from "react";

export const HERO_POEM = "行到水穷处，坐看云起时。";
export function Typewriter() {
  const [count, setCount] = useState(0);
  const [reduced, setReduced] = useState(false);
  const letters = Array.from(HERO_POEM);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout>;
    let index = 0;
    const tick = () => {
      if (document.hidden) return;
      index = Math.min(index + 1, letters.length);
      setCount(index);
      if (index < letters.length) timer = setTimeout(tick, letters[index - 1] === "\n" ? 500 : 165);
    };
    const sync = () => {
      clearTimeout(timer);
      setReduced(motion.matches);
      if (motion.matches) {
        index = letters.length;
        setCount(index);
      } else if (!document.hidden && index < letters.length) timer = setTimeout(tick, 400);
    };
    sync();
    motion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearTimeout(timer);
      motion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [letters.length]);
  return (
    <h1 className="nl-poem" aria-label={HERO_POEM.replace("\n", "")}>
      <span className="nl-sr-only">{HERO_POEM}</span>
      <span className="nl-poem-reserve" aria-hidden="true">
        {HERO_POEM}
      </span>
      <span className="nl-poem-typed" aria-hidden="true" data-complete={count === letters.length}>
        {letters.slice(0, count).join("")}
        {!reduced && (
          <span className={`nl-type-caret ${count === letters.length ? "is-complete" : ""}`} />
        )}
      </span>
    </h1>
  );
}
