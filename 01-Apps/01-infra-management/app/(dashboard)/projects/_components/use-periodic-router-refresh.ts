"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

let refreshClaimed = false;

export function usePeriodicRouterRefresh(active: boolean, intervalMs: number) {
  const router = useRouter();
  const [refreshPending, startRefresh] = useTransition();
  const ownsRefresh = useRef(false);

  useEffect(() => {
    if (!refreshPending && ownsRefresh.current) {
      ownsRefresh.current = false;
      refreshClaimed = false;
    }
  }, [refreshPending]);

  useEffect(() => {
    if (!active) return;

    const refresh = () => {
      if (refreshClaimed || refreshPending) return;
      refreshClaimed = true;
      ownsRefresh.current = true;
      startRefresh(() => router.refresh());
    };
    const initialRefresh = window.setTimeout(refresh, intervalMs);
    const interval = window.setInterval(refresh, intervalMs);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [active, intervalMs, refreshPending, router]);
}
