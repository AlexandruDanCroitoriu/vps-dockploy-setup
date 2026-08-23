"use client";

import { usePeriodicRouterRefresh } from "../use-periodic-router-refresh";

export function ServiceStatusRefresh({ active }: { active: boolean }) {
  usePeriodicRouterRefresh(active, 2_000);

  return null;
}
