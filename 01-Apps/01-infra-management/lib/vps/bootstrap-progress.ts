export const DOKPLOY_BOOTSTRAP_STEPS = [
  "connecting",
  "updating",
  "installing",
  "starting",
  "administrator",
  "domain",
  "api-key",
  "verifying",
  "zot",
] as const;

export type DokployBootstrapStep = (typeof DOKPLOY_BOOTSTRAP_STEPS)[number];
export type DokployBootstrapStepStatus = "running" | "done" | "error";
