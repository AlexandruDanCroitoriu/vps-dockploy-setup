import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  deployDokployZotRegistry,
  ensureDokployMainProject,
} from "@/lib/dokploy/bootstrap-zot";
import { updateDokployInstance } from "@/lib/storage/dokploy-instances";
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
