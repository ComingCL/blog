"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./client";
import type { Page } from "./types";

// Shared list lifecycle: stale requests cannot replace a newer filter, and
// deleting the final row returns to a valid page rather than an empty dead end.
export function usePage<T>(path: string, page: number, setPage: (page: number) => void, delay = 0) {
  const [data, setData] = useState<Page<T> | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    const timer = setTimeout(() => {
      api<Page<T>>(path)
        .then((value) => {
          if (!active) return;
          const last = Math.max(1, value.pagination.total_pages);
          if (page > last) {
            setPage(last);
            return;
          }
          setData(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [path, page, setPage, delay, revision]);
  return { data, error, loading, reload };
}
