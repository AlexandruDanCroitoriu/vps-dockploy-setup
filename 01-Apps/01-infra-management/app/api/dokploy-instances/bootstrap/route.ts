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
  const job = getDokployProvisioningJob(jobId);
  if (!job)
    return Response.json({ message: "Setup was not found." }, { status: 404 });
  const step = requestedStep as DokployBootstrapStep;
  if (!DOKPLOY_BOOTSTRAP_STEPS.includes(step)) {
    return Response.json(
      { message: "Choose a valid setup step." },
      { status: 400 },
    );
  }
  const nextStep = DOKPLOY_BOOTSTRAP_STEPS.find(
    (candidate) => job.steps[candidate] !== "done",
  );
  if (step !== nextStep) {
    return Response.json(
      { message: "Complete the current setup step first." },
      { status: 409 },
    );
  }
  updateDokployProvisioningJob(job.id, { status: "running", error: "" });
  const setupConfiguration = {
    baseUrl: `http://${job.vpsIp}:3000`,
    apiKey: job.apiKey,
  };
  const progress = (
    currentStep: DokployBootstrapStep,
    status: "running" | "done" | "error",
    message?: string,
  ) => {
    updateDokployProvisioningJob(job.id, {
      step: currentStep,
      stepStatus: status,
      log: {
        step: currentStep,
        message:
          status === "running"
            ? "Step started."
            : status === "done"
              ? "Step completed."
              : message || "Step failed.",
      },
      ...(status === "error" ? { error: message || "This step failed." } : {}),
    });
  };
  try {
    if (step === "main-project") {
      progress(step, "running");
      const project = await ensureDokployMainProject(setupConfiguration);
      updateDokployProvisioningJob(job.id, {
        log: {
          step,
          message: project.created
            ? "Main project created."
            : "Existing Main project reused.",
        },
      });
      progress(step, "done");
    } else if (step === "zot") {
      progress(step, "running");
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
      progress(step, "done");
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
    const complete = DOKPLOY_BOOTSTRAP_STEPS.every(
      (candidate) => updatedJob.steps[candidate] === "done",
    );
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
    updateDokployProvisioningJob(job.id, {
      status: complete ? "complete" : "waiting",
      error: "",
    });
    return Response.json(getDokployProvisioningJob(job.id));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "VPS setup failed.";
    if (getDokployProvisioningJob(job.id)?.steps[step] !== "error") {
      progress(step, "error", message);
    }
    updateDokployProvisioningJob(job.id, { status: "failed", error: message });
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
