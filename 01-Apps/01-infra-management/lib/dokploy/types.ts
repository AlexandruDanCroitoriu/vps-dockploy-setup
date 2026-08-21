export const DOKPLOY_SERVICE_TYPES = [
  "applications",
  "compose",
  "postgres",
  "mysql",
  "mariadb",
  "mongo",
  "redis",
] as const;

export type DokployServiceType = (typeof DOKPLOY_SERVICE_TYPES)[number];
export type DokployDatabaseType = Exclude<
  DokployServiceType,
  "applications" | "compose"
>;

export type DokployServiceStatus = "running" | "deploying" | "down";

export type DokployService = {
  id: string;
  name: string;
  appName: string | null;
  env: string;
  serverId: string | null;
  sourcePath: string | null;
  type: DokployServiceType;
  status: DokployServiceStatus;
  credentials: Array<{ label: string; value: string; secret?: boolean }>;
};

export type DokployEnvironment = {
  environmentId: string;
  name: string;
  services: DokployService[];
};

export type DokployProject = {
  projectId: string;
  name: string;
  description: string | null;
  createdAt: string;
  env: string;
  environments: DokployEnvironment[];
};

export type DokployDeployment = {
  deploymentId: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
};

export type DokployDomain = {
  domainId: string;
  host: string;
  port: number;
  https: boolean;
  letsEncrypt: boolean;
  serviceName: string;
  enabled: boolean;
};

export type DokployDnsValidation = {
  isValid: boolean;
  resolvedIp: string;
  message: string;
  cdnProvider: string;
};

export type JsonRecord = Record<string, unknown>;

export type Loadable<T> =
  { status: "success"; data: T } | { status: "error"; message: string };
