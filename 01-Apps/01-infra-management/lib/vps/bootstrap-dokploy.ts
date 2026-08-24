import "server-only";

import { isIP } from "node:net";
import { Client } from "ssh2";
import type {
  DokployBootstrapStep,
  DokployBootstrapStepStatus,
} from "./bootstrap-progress";

type BootstrapDokployInput = {
  ipAddress: string;
  rootDomain: string;
  administratorEmail: string;
  administratorPassword: string;
  vpsPassword: string;
  completedSteps?: DokployBootstrapStep[];
};

type ProgressCallback = (
  step: DokployBootstrapStep,
  status: DokployBootstrapStepStatus,
  message?: string,
) => void | Promise<void>;
type LogCallback = (step: DokployBootstrapStep, message: string) => void;
type ApiKeyCallback = (apiKey: string) => void | Promise<void>;

function sanitizeLogLine(value: string) {
  return value
    .replace(/SWMTKN-[A-Za-z0-9-]+/g, "[REDACTED TOKEN]")
    .replace(
      /((?:password|secret|token|api[_ -]?key)\s*[:=]\s*)\S+/gi,
      "$1[REDACTED]",
    )
    .slice(0, 1_000);
}

function runSshCommand(
  input: BootstrapDokployInput,
  command: string,
  timeoutMs = 30 * 60 * 1_000,
  failureMessage = "VPS provisioning failed.",
  onLog: (message: string) => void = () => {},
) {
  return new Promise<void>((resolve, reject) => {
    const connection = new Client();
    const timeout = setTimeout(() => {
      connection.end();
      reject(new Error("VPS provisioning timed out."));
    }, timeoutMs);

    connection
      .on("ready", () => {
        const remoteCommand =
          'export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin"; hash -r 2>/dev/null || true; ' +
          command;
        connection.exec(
          remoteCommand.replace("$DOKPLOY_BOOTSTRAP_IP", input.ipAddress),
          {},
          (error, stream) => {
            if (error) {
              clearTimeout(timeout);
              connection.end();
              reject(new Error("Unable to start VPS provisioning."));
              return;
            }
            let stdout = "";
            let stderr = "";
            const consume = (chunk: Buffer, source: "stdout" | "stderr") => {
              const combined =
                (source === "stdout" ? stdout : stderr) + chunk.toString();
              const lines = combined.split(/\r?\n/);
              if (source === "stdout") stdout = lines.pop() ?? "";
              else stderr = lines.pop() ?? "";
              for (const line of lines) {
                const sanitized = sanitizeLogLine(line.trimEnd());
                if (sanitized)
                  onLog(
                    `${source === "stderr" ? "[stderr] " : ""}${sanitized}`,
                  );
              }
            };
            stream.on("data", (chunk: Buffer) => consume(chunk, "stdout"));
            stream.stderr.on("data", (chunk: Buffer) =>
              consume(chunk, "stderr"),
            );
            stream.on("close", (code: number | null) => {
              for (const [source, remainder] of [
                ["stdout", stdout],
                ["stderr", stderr],
              ] as const) {
                const sanitized = sanitizeLogLine(remainder.trimEnd());
                if (sanitized)
                  onLog(
                    `${source === "stderr" ? "[stderr] " : ""}${sanitized}`,
                  );
              }
              clearTimeout(timeout);
              connection.end();
              if (code === 0) resolve();
              else reject(new Error(failureMessage));
            });
            stream.resume();
          },
        );
      })
      .on("error", () => {
        clearTimeout(timeout);
        reject(
          new Error(
            "Unable to authenticate to the VPS as root with that password.",
          ),
        );
      })
      .connect({
        host: input.ipAddress,
        port: 22,
        username: "root",
        password: input.vpsPassword,
        readyTimeout: 30_000,
        keepaliveInterval: 10_000,
      });
  });
}

async function waitForUrl(
  url: string,
  timeoutMs: number,
  onAttempt: (message: string) => void = () => {},
) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status < 500) return;
      onAttempt(`Attempt ${attempt}: HTTP ${response.status}.`);
    } catch {
      onAttempt(`Attempt ${attempt}: connection unavailable.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Timed out waiting for ${new URL(url).host}.`);
}

async function dokployRequest(
  baseUrl: string,
  path: string,
  body: unknown,
  options: {
    cookie?: string;
    apiKey?: string;
    method?: "GET" | "POST";
  } = {},
) {
  const method = options.method ?? "POST";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      Origin: baseUrl,
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.apiKey ? { "x-api-key": options.apiKey } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(
      `Dokploy setup rejected ${path} (HTTP ${response.status}).`,
    );
  }
  return { response, payload };
}

export function firstOrganizationId(payload: unknown): string {
  if (!Array.isArray(payload)) return "";
  for (const value of payload) {
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string" && record.id) return record.id;
    if (typeof record.organizationId === "string" && record.organizationId) {
      return record.organizationId;
    }
  }
  return "";
}

export function createdApiKey(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }
  const key = (payload as Record<string, unknown>).key;
  return typeof key === "string" ? key.trim() : "";
}

export async function bootstrapDokployVps(
  input: BootstrapDokployInput,
  onProgress: ProgressCallback = () => {},
  onLog: LogCallback = () => {},
  onApiKey: ApiKeyCallback = () => {},
) {
  if (!isIP(input.ipAddress)) throw new Error("Enter a valid VPS IP address.");

  let activeStep: DokployBootstrapStep = "connecting";
  const runStep = async <T>(
    step: DokployBootstrapStep,
    operation: () => Promise<T>,
  ) => {
    activeStep = step;
    await onProgress(step, "running");
    const result = await operation();
    await onProgress(step, "done");
    return result;
  };

  try {
    await runStep("connecting", () =>
      runSshCommand(
        input,
        "true",
        30_000,
        "Unable to connect to the VPS.",
        (message) => onLog("connecting", message),
      ),
    );
    if (!input.completedSteps?.includes("updating")) {
      await runStep("updating", () =>
        runSshCommand(
        input,
        'export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a APT_LISTCHANGES_FRONTEND=none; if command -v cloud-init >/dev/null 2>&1; then echo "Waiting for the VPS first-boot initialization to finish..."; timeout 10m cloud-init status --wait; cloud_status=$?; if [ "$cloud_status" -eq 124 ]; then echo "First-boot initialization did not finish within 10 minutes." >&2; cloud-init status --long 2>&1 || true; exit 1; elif [ "$cloud_status" -ne 0 ]; then echo "Warning: cloud-init completed with an error reported by the VPS provider; continuing after checking package-manager locks." >&2; cloud-init status --long 2>&1 || true; else echo "VPS first-boot initialization finished."; fi; fi; lock_wait=0; while command -v fuser >/dev/null 2>&1; do busy_lock=""; for lock in /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock; do if fuser "$lock" >/dev/null 2>&1; then busy_lock="$lock"; break; fi; done; [ -z "$busy_lock" ] && break; if [ $((lock_wait % 6)) -eq 0 ]; then echo "Waiting for the operating system package manager ($busy_lock)..."; fuser -v "$busy_lock" 2>&1 || true; fi; if [ "$lock_wait" -ge 120 ]; then echo "The package-manager lock was still busy after 10 minutes: $busy_lock" >&2; exit 1; fi; lock_wait=$((lock_wait + 1)); sleep 5; done; echo "Finishing interrupted package configuration..."; dpkg --configure -a || exit 1; echo "Refreshing package indexes..."; apt-get update || exit 1; echo "Upgrading installed operating-system packages..."; apt-get -yq -o Dpkg::Options::="--force-confold" upgrade || exit 1; echo "Installing provisioning requirements..."; apt-get -yq install curl ca-certificates; package_status=$?; if [ "$package_status" -eq 0 ] && command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then echo "Allowing Dokploy web ports through UFW..."; ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 3000/tcp; fi; exit "$package_status"',
        30 * 60 * 1_000,
        "Operating-system update failed. Check APT, cloud-init, package locks, and available disk space on the VPS.",
        (message) => onLog("updating", message),
        ),
      );
    }
    if (!input.completedSteps?.includes("installing")) {
      await runStep("installing", () =>
        runSshCommand(
        input,
        'if docker service inspect dokploy >/dev/null 2>&1; then echo "Existing Dokploy service detected; resuming the previous installation."; docker service ls 2>&1; exit 0; fi; installer_file=$(mktemp) || exit 1; curl -fsSL https://dokploy.com/install.sh -o "$installer_file" || { rm -f "$installer_file"; exit 1; }; ADVERTISE_ADDR="$DOKPLOY_BOOTSTRAP_IP" timeout 15m sh "$installer_file" & installer_pid=$!; monitor_attempt=0; while kill -0 "$installer_pid" >/dev/null 2>&1; do sleep 10; monitor_attempt=$((monitor_attempt + 1)); if [ $((monitor_attempt % 3)) -eq 0 ]; then echo "Dokploy installer is still running; current Docker service state:"; docker service ls 2>&1 || true; service_ids=$(docker service ls -q 2>/dev/null); if [ -n "$service_ids" ]; then docker service ps --no-trunc --format "{{.Name}} | {{.DesiredState}} | {{.CurrentState}} | {{.Error}}" $service_ids 2>&1 || true; fi; fi; done; wait "$installer_pid"; install_status=$?; rm -f "$installer_file"; if [ "$install_status" -ne 0 ]; then echo "Dokploy installer did not converge. Docker service diagnostics:" >&2; docker service ls 2>&1 || true; service_ids=$(docker service ls -q 2>/dev/null); if [ -n "$service_ids" ]; then docker service ps --no-trunc $service_ids 2>&1 || true; fi; echo "Recent Dokploy logs:" >&2; timeout 10s docker service logs --raw --tail 100 dokploy 2>&1 || true; fi; exit "$install_status"',
        16 * 60 * 1_000,
        "Dokploy installation did not converge. Review the Docker service diagnostics in this step's logs.",
        (message) => onLog("installing", message),
        ),
      );
    }

    const ipUrl = `http://${input.ipAddress}:3000`;
    await runStep("starting", async () => {
      await runSshCommand(
        input,
        'docker_bin=$(command -v docker 2>/dev/null || true); if [ -z "$docker_bin" ]; then for candidate in /usr/bin/docker /usr/local/bin/docker /snap/bin/docker; do if [ -x "$candidate" ]; then docker_bin="$candidate"; break; fi; done; fi; if [ -z "$docker_bin" ]; then echo "Docker CLI is unavailable in this SSH session (PATH=$PATH)." >&2; ls -l /usr/bin/docker /usr/local/bin/docker /snap/bin/docker 2>&1 || true; exit 1; fi; echo "Using Docker CLI at $docker_bin."; attempt=1; while [ "$attempt" -le 60 ]; do if curl -fsS --max-time 5 http://127.0.0.1:3000 >/dev/null 2>&1; then echo "Dokploy is responding locally on port 3000."; exit 0; fi; if [ $((attempt % 6)) -eq 0 ]; then echo "Still waiting for the Dokploy service (attempt $attempt/60)."; "$docker_bin" service ls 2>&1 || true; echo "Dokploy task status:"; "$docker_bin" service ps --no-trunc --format "{{.Name}} | {{.DesiredState}} | {{.CurrentState}} | {{.Error}}" dokploy 2>&1 || true; echo "Port 3000 listeners:"; ss -lntp "sport = :3000" 2>&1 || true; echo "Recent Dokploy logs:"; timeout 10s "$docker_bin" service logs --raw --tail 30 dokploy 2>&1 || true; terminal_error=$("$docker_bin" service ps --no-trunc --format "{{.CurrentState}} {{.Error}}" dokploy 2>/dev/null | grep -E "^(Failed|Rejected|Shutdown)|task: non-zero exit|address already in use|port is already allocated" | head -n 1 || true); if [ -n "$terminal_error" ] && [ "$attempt" -ge 18 ]; then echo "Dokploy repeatedly failed to start: $terminal_error" >&2; exit 1; fi; fi; attempt=$((attempt + 1)); sleep 5; done; echo "Dokploy did not start locally. Service tasks:" >&2; "$docker_bin" service ps --no-trunc dokploy 2>&1 || true; echo "Port 3000 listeners:" >&2; ss -lntp "sport = :3000" 2>&1 || true; echo "Recent Dokploy service logs:" >&2; timeout 10s "$docker_bin" service logs --raw --tail 100 dokploy 2>&1 || true; exit 1',
        6 * 60 * 1_000,
        "Dokploy did not start on the VPS. Review the service task and container logs.",
        (message) => onLog("starting", message),
      );
      onLog(
        "starting",
        `Dokploy is running locally; checking ${input.ipAddress}:3000 from Infra Management.`,
      );
      await waitForUrl(ipUrl, 2 * 60 * 1_000, (message) =>
        onLog("starting", message),
      );
    });
    const authentication = await runStep("administrator", async () => {
      try {
        return await dokployRequest(ipUrl, "/api/auth/sign-up/email", {
          name: input.administratorEmail,
          email: input.administratorEmail,
          password: input.administratorPassword,
        });
      } catch {
        onLog(
          "administrator",
          "Administrator creation was unavailable; signing in with the configured credentials.",
        );
        return dokployRequest(ipUrl, "/api/auth/sign-in/email", {
          email: input.administratorEmail,
          password: input.administratorPassword,
        });
      }
    });
    const cookie = authentication.response.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ");
    if (!cookie) throw new Error("Dokploy did not create an admin session.");

    const host = `dockploy.${input.rootDomain}`;
    const rootUrl = `https://${host}`;
    await runStep("domain", async () => {
      await dokployRequest(
        ipUrl,
        "/api/settings.assignDomainServer",
        {
          host,
          certificateType: "letsencrypt",
          letsEncryptEmail: input.administratorEmail,
          https: true,
        },
        { cookie },
      );
      onLog(
        "domain",
        `Configured ${rootUrl}; DNS and certificate availability will be checked after setup.`,
      );
    });

    const tokenResult = await runStep("api-key", async () => {
      const organizations = await dokployRequest(
        ipUrl,
        "/api/organization.all",
        undefined,
        { cookie, method: "GET" },
      );
      const organizationId = firstOrganizationId(organizations.payload);
      if (!organizationId) {
        throw new Error(
          "Dokploy administrator does not belong to an organization.",
        );
      }
      return dokployRequest(
        ipUrl,
        "/api/user.createApiKey",
        {
          name: "Infra Management",
          metadata: { organizationId },
          rateLimitEnabled: false,
        },
        { cookie },
      );
    });
    const apiKey = createdApiKey(tokenResult.payload);
    if (!apiKey) throw new Error("Dokploy did not return an API/CLI key.");
    await onApiKey(apiKey);
    await runStep("verifying", () =>
      dokployRequest(ipUrl, "/api/project.all", undefined, {
        apiKey,
        method: "GET",
      }),
    );

    return { apiKey, rootUrl, setupUrl: ipUrl };
  } catch (error) {
    await onProgress(
      activeStep,
      "error",
      error instanceof Error ? error.message : "This step failed.",
    );
    throw error;
  }
}
