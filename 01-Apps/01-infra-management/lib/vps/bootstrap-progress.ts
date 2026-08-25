export const DOKPLOY_BOOTSTRAP_STEPS = [
  "updating",
  "installing",
  "administrator",
  "domain",
  "api-key",
  "main-project",
  "zot",
] as const;

export type DokployBootstrapStep = (typeof DOKPLOY_BOOTSTRAP_STEPS)[number];
export type DokployBootstrapStepStatus = "running" | "done" | "error";
