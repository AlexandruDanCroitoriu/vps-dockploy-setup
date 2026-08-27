import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/auth";
import {
  deployDokployZotRegistry,
  ensureDokployMainProject,
  inspectDokployBootstrapResources,
} from "@/lib/dokploy/bootstrap-zot";
import { updateDokployInstance } from "@/lib/storage/dokploy-instances";
import { refreshSidebarProjectSnapshot } from "@/lib/dokploy/sidebar-project-snapshot";
import { runDokployBootstrapStep } from "@/lib/vps/bootstrap-dokploy";
import {
  DOKPLOY_BOOTSTRAP_STEPS,
  type DokployBootstrapStep,
} from "@/lib/vps/bootstrap-progress";
import {
  beginDokployProvisioningStep,
  completeDokployProvisioningStep,
  failDokployProvisioningStep,
  getDokployProvisioningJob,
  updateDokployProvisioningJob,
} from "@/lib/storage/dokploy-provisioning";

export const dynamic = "force-dynamic";
export const maxDuration = 1_800;

type BootstrapRequest = {
  jobId?: unknown;
  step?: unknown;
};

async function refreshBootstrapSidebar(
  instanceId: string,
  step: "main-project" | "zot",
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const snapshot = await refreshSidebarProjectSnapshot(instanceId);
    const visible =
      step === "main-project"
        ? snapshot.projects.some(
            (project) => project.name.trim().toLowerCase() === "main",
          )
        : snapshot.projects.some((project) =>
            project.environments.some((environment) =>
              environment.services.some(
                (service) => service.name.trim().toLowerCase() === "zot",
              ),
            ),
          );
    if (visible) return;
    if (attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function executeSavedStep(jobId: string, requestedStep: string) {
  const step = requestedStep as DokployBootstrapStep;
  if (!DOKPLOY_BOOTSTRAP_STEPS.includes(step)) {
    return Response.json(
      { message: "Choose a valid setup step." },
      { status: 400 },
    );
  }
  const started = beginDokployProvisioningStep(jobId, step);
  if (started.status === "not-found") {
    return Response.json({ message: "Setup was not found." }, { status: 404 });
  }
  if (started.status === "busy") {
    return Response.json(
      { message: "A setup step is already running." },
      { status: 409 },
    );
  }
  if (started.status === "out-of-order") {
    return Response.json(
      { message: "Complete the current setup step first." },
      { status: 409 },
    );
  }
  const job = started.job;
  const setupConfiguration = {
    baseUrl: `http://${job.vpsIp}:3000`,
    apiKey: job.apiKey,
  };
  const progress = (
    currentStep: DokployBootstrapStep,
    status: "running" | "done" | "error",
    message?: string,
  ) => {
    if (status === "running") return;
    updateDokployProvisioningJob(job.id, {
      step: currentStep,
      stepStatus: status,
      log: {
        step: currentStep,
        message:
          status === "done" ? "Step completed." : message || "Step failed.",
      },
      ...(status === "error" ? { error: message || "This step failed." } : {}),
    });
  };
  try {
    if (step === "main-project") {
      const project = await ensureDokployMainProject(setupConfiguration);
      updateDokployProvisioningJob(job.id, {
        log: {
          step,
          message: project.created
            ? "Main project created."
            : "Existing Main project reused.",
        },
      });
    } else if (step === "zot") {
      const zot = await deployDokployZotRegistry({
        configuration: setupConfiguration,
        rootDomain: job.rootDomain,
        username: job.defaultServiceUsername,
        password: job.defaultServicePassword,
        onStatus: (message) => {
          updateDokployProvisioningJob(job.id, {
            log: { step, message },
          });
        },
      });
      updateDokployProvisioningJob(job.id, {
        log: {
          step,
          message: zot.created
            ? "Zot is running in the Main project."
            : "Existing running Zot service reused.",
        },
      });
    } else {
      await runDokployBootstrapStep(
        {
          ipAddress: job.vpsIp,
          rootDomain: job.rootDomain,
          administratorEmail: job.defaultServiceUsername,
          administratorPassword: job.defaultServicePassword,
          vpsPassword: job.defaultServicePassword,
          step,
          apiKey: job.apiKey,
        },
        progress,
        (logStep, message) => {
          updateDokployProvisioningJob(job.id, {
            log: { step: logStep, message },
          });
        },
        (apiKey) => {
          updateDokployProvisioningJob(job.id, { apiKey });
        },
      );
      if (step === "api-key") {
        const refreshedJob = getDokployProvisioningJob(job.id)!;
        try {
          const existing = await inspectDokployBootstrapResources({
            baseUrl: setupConfiguration.baseUrl,
            apiKey: refreshedJob.apiKey,
          });
          if (existing.mainProjectExists) {
            updateDokployProvisioningJob(job.id, {
              step: "main-project",
              stepStatus: "done",
              log: {
                step: "main-project",
                message:
                  "Existing Main project detected; step completed automatically.",
              },
            });
          }
          if (existing.zotExists) {
            updateDokployProvisioningJob(job.id, {
              step: "zot",
              stepStatus: "done",
              log: {
                step: "zot",
                message:
                  "Existing Zot service detected; step completed automatically.",
              },
            });
          }
        } catch {
          updateDokployProvisioningJob(job.id, {
            log: {
              step: "api-key",
              message:
                "Existing Main project and Zot service could not be detected; continue with the remaining idempotent steps.",
            },
          });
        }
      }
    }
    const updatedJob = getDokployProvisioningJob(job.id)!;
    if (updatedJob.instanceId) {
      updateDokployInstance(updatedJob.instanceId, {
        name: updatedJob.name,
        rootUrl: updatedJob.rootUrl,
        rootDomain: updatedJob.rootDomain,
        vpsIp: updatedJob.vpsIp,
        vpsPassword: updatedJob.defaultServicePassword,
        apiKey: updatedJob.apiKey,
        defaultServiceUsername: updatedJob.defaultServiceUsername,
        defaultServicePassword: updatedJob.defaultServicePassword,
      });
      if (step === "main-project" || step === "zot") {
        await refreshBootstrapSidebar(updatedJob.instanceId, step).catch(
          () => {},
        );
        revalidatePath("/", "layout");
      }
    }
    return Response.json(completeDokployProvisioningStep(job.id, step));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "VPS setup failed.";
    failDokployProvisioningStep(job.id, step, message);
    return Response.json(
      { ...getDokployProvisioningJob(job.id), message },
      { status: 500 },
    );
  }
}

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
  const jobId = text(body?.jobId);
  const requestedStep = text(body?.step);
  return executeSavedStep(jobId, requestedStep);
}
