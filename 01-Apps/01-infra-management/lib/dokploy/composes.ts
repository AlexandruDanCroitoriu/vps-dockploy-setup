import "server-only";

import { dokployGet, dokployPost } from "./client";
import { createDokployDomain, generateDokployDomain } from "./domains";
import { isRecord, stringValue } from "./normalizers";

function composeIdFromPayload(payload: unknown) {
  const candidate =
    isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  return isRecord(candidate) ? stringValue(candidate.composeId) : "";
}

function composeDetailsFromPayload(payload: unknown) {
  const candidate =
    isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  return isRecord(candidate) ? candidate : null;
}

export async function getDokployRawComposeFile(composeId: string) {
  const details = composeDetailsFromPayload(
    await dokployGet<unknown>(
      `compose.one?${new URLSearchParams({ composeId })}`,
    ),
  );
  if (!details || stringValue(details.sourceType).toLowerCase() !== "raw") {
    return null;
  }
  return stringValue(details.composeFile);
}

export async function configureDokployRawCompose(
  composeId: string,
  composeFile: string,
) {
  await dokployPost("compose.update", {
    composeId,
    sourceType: "raw",
    composeType: "docker-compose",
    composeFile,
  });
}

export async function createDokployRawCompose(input: {
  name: string;
  environmentId: string;
  composeFile: string;
  environmentVariables: string;
  domain?: {
    host?: string;
    generate?: boolean;
    serviceName: string;
    port: number;
    https: boolean;
  };
}) {
  const created = await dokployPost<unknown>("compose.create", {
    name: input.name,
    environmentId: input.environmentId,
    composeType: "docker-compose",
    sourceType: "raw",
    composeFile: input.composeFile,
  });
  const composeId = composeIdFromPayload(created);
  if (!composeId) throw new Error("Dokploy did not return the new Compose ID.");

  try {
    await configureDokployRawCompose(composeId, input.composeFile);
    if (input.environmentVariables) {
      await dokployPost("compose.saveEnvironment", {
        composeId,
        env: input.environmentVariables,
      });
    }
    if (input.domain) {
      let host = input.domain.host ?? "";
      if (input.domain.generate) {
        let details = composeDetailsFromPayload(created);
        if (!details || !stringValue(details.appName)) {
          details = composeDetailsFromPayload(
            await dokployGet<unknown>(
              `compose.one?${new URLSearchParams({ composeId })}`,
            ),
          );
        }
        host = await generateDokployDomain(
          stringValue(details?.appName, input.name),
          stringValue(details?.serverId) || undefined,
        );
      }
      await createDokployDomain({
        type: "compose",
        serviceId: composeId,
        serviceName: input.domain.serviceName,
        host,
        port: input.domain.port,
        https: input.domain.https,
        letsEncrypt: input.domain.https,
      });
    }
    return composeId;
  } catch (error) {
    await dokployPost("compose.delete", {
      composeId,
      deleteVolumes: false,
    }).catch(() => {});
    throw error;
  }
}
