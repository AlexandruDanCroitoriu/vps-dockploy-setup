import { getServerSession } from "next-auth";
import { isIP } from "node:net";

import { authOptions } from "@/auth";
import { verifyDokployConnection } from "@/lib/dokploy";
import { ACTIVE_DOKPLOY_COOKIE } from "@/lib/dokploy";
import { ensureDokployZotRegistry } from "@/lib/dokploy/bootstrap-zot";
import {
  createDokployInstance,
  getDokployUrlFromRootDomain,
  isDuplicateInstanceError,
  normalizeRootDomain,
} from "@/lib/storage/dokploy-instances";
import { bootstrapDokployVps } from "@/lib/vps/bootstrap-dokploy";
import type { DokployBootstrapStep } from "@/lib/vps/bootstrap-progress";
import {
  getDokployProvisioningJob,
  startDokployProvisioningJob,
  updateDokployProvisioningJob,
} from "@/lib/storage/dokploy-provisioning";

export const dynamic = "force-dynamic";
export const maxDuration = 1_800;

type BootstrapRequest = {
  name?: unknown;
  rootDomain?: unknown;
  ipAddress?: unknown;
  defaultServiceUsername?: unknown;
  defaultServicePassword?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  if (!(await getServerSession(authOptions))?.user) {
    return Response.json({ message: "Unauthorized." }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const job = getDokployProvisioningJob(id);
  return job
    ? Response.json(job, { headers: { "Cache-Control": "no-store" } })
    : Response.json({ message: "Setup was not found." }, { status: 404 });
}

export async function POST(request: Request) {
  if (!(await getServerSession(authOptions))?.user) {
    return Response.json({ message: "Unauthorized." }, { status: 401 });
  }

  const body = (await request
    .json()
    .catch(() => null)) as BootstrapRequest | null;
  const name = text(body?.name);
  const ipAddress = text(body?.ipAddress);
  const administratorEmail = text(body?.defaultServiceUsername);
  const administratorPassword =
    typeof body?.defaultServicePassword === "string"
      ? body.defaultServicePassword
      : "";
  let rootDomain = "";
  try {
    rootDomain = normalizeRootDomain(text(body?.rootDomain));
  } catch {
    return Response.json(
      { message: "Enter a valid root domain." },
      { status: 400 },
    );
  }
  if (!name || name.length > 100 || !isIP(ipAddress)) {
    return Response.json(
      { message: "Complete the instance name and VPS connection fields." },
      { status: 400 },
    );
  }
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(administratorEmail) ||
    !administratorPassword ||
    administratorEmail.length > 255 ||
    administratorPassword.length > 255
  ) {
    return Response.json(
      { message: "Enter valid Dokploy administrator credentials." },
      { status: 400 },
    );
  }

  const job = startDokployProvisioningJob({
    name,
    rootDomain,
    rootUrl: getDokployUrlFromRootDomain(rootDomain),
    vpsIp: ipAddress,
    vpsPassword: administratorPassword,
    defaultServiceUsername: administratorEmail,
    defaultServicePassword: administratorPassword,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {}
      };
      const heartbeat = setInterval(
        () => {
          updateDokployProvisioningJob(job.id, {});
          send({ type: "heartbeat", timestamp: Date.now() });
        },
        10_000,
      );
      try {
        send({ type: "job", jobId: job.id });
        const bootstrapped = await bootstrapDokployVps(
          {
            ipAddress,
            rootDomain,
            administratorEmail,
            administratorPassword,
            vpsPassword: administratorPassword,
            completedSteps: Object.entries(job.steps).flatMap(
              ([step, status]) =>
                status === "done" ? [step as DokployBootstrapStep] : [],
            ),
          },
          (step, status, message) => {
            const stepLog =
              status === "running"
                ? "Step started."
                : status === "done"
                  ? "Step completed."
                  : message || "Step failed.";
            updateDokployProvisioningJob(job.id, {
              step,
              stepStatus: status,
              log: { step, message: stepLog },
              ...(status === "error" ? { error: message ?? "This step failed." } : {}),
            });
            send({ type: "step", step, status, message });
            send({
              type: "log",
              step,
              message: stepLog,
            });
          },
          (step, message) => {
            updateDokployProvisioningJob(job.id, { log: { step, message } });
            send({ type: "log", step, message });
          },
          (apiKey) => {
            updateDokployProvisioningJob(job.id, { apiKey });
            send({ type: "credential", apiKey });
          },
        );
        await verifyDokployConnection({
          baseUrl: bootstrapped.setupUrl,
          apiKey: bootstrapped.apiKey,
        });
        updateDokployProvisioningJob(job.id, {
          step: "zot",
          stepStatus: "running",
          log: { step: "zot", message: "Step started." },
        });
        send({ type: "step", step: "zot", status: "running" });
        send({ type: "log", step: "zot", message: "Step started." });
        try {
          const zot = await ensureDokployZotRegistry({
            configuration: {
              baseUrl: bootstrapped.setupUrl,
              apiKey: bootstrapped.apiKey,
            },
            rootDomain,
            username: administratorEmail,
            password: administratorPassword,
          });
          const zotMessage = zot.created
            ? `${zot.projectCreated ? "Created" : "Reused"} the main project and queued the Zot registry deployment.`
            : "An existing Zot service was found; no project or service was created.";
          updateDokployProvisioningJob(job.id, {
            log: { step: "zot", message: zotMessage },
          });
          send({ type: "log", step: "zot", message: zotMessage });
          updateDokployProvisioningJob(job.id, {
            step: "zot",
            stepStatus: "done",
            log: { step: "zot", message: "Step completed." },
          });
          send({ type: "step", step: "zot", status: "done" });
          send({ type: "log", step: "zot", message: "Step completed." });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to create and deploy Zot.";
          updateDokployProvisioningJob(job.id, {
            step: "zot",
            stepStatus: "error",
            error: message,
            log: { step: "zot", message },
          });
          send({ type: "step", step: "zot", status: "error", message });
          send({ type: "log", step: "zot", message });
          throw error;
        }
        const instance = createDokployInstance({
          name,
          rootDomain,
          rootUrl: getDokployUrlFromRootDomain(rootDomain),
          vpsIp: ipAddress,
          vpsPassword: administratorPassword,
          apiKey: bootstrapped.apiKey,
          defaultServiceUsername: administratorEmail,
          defaultServicePassword: administratorPassword,
        });
        updateDokployProvisioningJob(job.id, {
          status: "complete",
          instanceId: instance.id,
          apiKey: bootstrapped.apiKey,
          error: "",
        });
        send({ type: "complete", instanceId: instance.id });
      } catch (error) {
        const message = isDuplicateInstanceError(error)
          ? "That Dockploy instance is already configured."
          : error instanceof Error
            ? error.message
            : "VPS setup failed.";
        updateDokployProvisioningJob(job.id, {
          status: "failed",
          error: message,
        });
        send({
          type: "failed",
          message,
        });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Set-Cookie": `${ACTIVE_DOKPLOY_COOKIE}=${encodeURIComponent(job.id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    },
  });
}
