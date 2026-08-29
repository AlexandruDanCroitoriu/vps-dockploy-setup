import "server-only";

import {
  createCloudflareDnsRecord,
  getCloudflareZones,
  invalidateCloudflareZones,
} from "@/lib/cloudflare/zones";
import {
  createResendSendingKey,
  ensureResendDomain,
  getResendDomain,
  verifyResendDomain,
} from "./client";

const VERIFICATION_ATTEMPTS = 30;
const VERIFICATION_INTERVAL_MS = 2_000;

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForResendDomainVerification(
  domainId: string,
  options: {
    attempts?: number;
    intervalMs?: number;
    wait?: (milliseconds: number) => Promise<unknown>;
  } = {},
) {
  const attempts = options.attempts ?? VERIFICATION_ATTEMPTS;
  const intervalMs = options.intervalMs ?? VERIFICATION_INTERVAL_MS;
  const wait = options.wait ?? delay;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const domain = await getResendDomain(domainId);
    if (domain.status.toLowerCase() === "verified") return domain;
    if (attempt < attempts - 1) await wait(intervalMs);
  }
  throw new Error(
    "The Resend domain is still pending DNS verification. Wait for DNS propagation and retry.",
  );
}

function absoluteRecordName(name: string, rootDomain: string) {
  const normalized = name.trim().toLowerCase().replace(/\.$/, "");
  const root = rootDomain.trim().toLowerCase().replace(/\.$/, "");
  if (!normalized || normalized === "@") return root;
  return normalized === root || normalized.endsWith(`.${root}`)
    ? normalized
    : `${normalized}.${root}`;
}

export async function provisionResendDomain(
  rootDomain: string,
  existingSendingKey = "",
) {
  const root = rootDomain.trim().toLowerCase().replace(/\.$/, "");
  const [domain, zones] = await Promise.all([
    ensureResendDomain(root),
    getCloudflareZones(),
  ]);
  const zone = zones.find((candidate) => candidate.name.toLowerCase() === root);
  if (!zone)
    throw new Error(
      `${root} is not available through the configured Cloudflare token.`,
    );

  for (const record of domain.records) {
    const name = absoluteRecordName(record.name, root);
    const value = record.value.replace(/^"|"$/g, "");
    const matching = zone.subdomains.find(
      (candidate) =>
        candidate.name.toLowerCase().replace(/\.$/, "") === name &&
        candidate.type === record.type,
    );
    if (
      matching?.content.replace(/^"|"$/g, "").replace(/\.$/, "") ===
      value.replace(/\.$/, "")
    )
      continue;
    if (matching)
      throw new Error(
        `Cloudflare already has a different ${record.type} record at ${name}.`,
      );
    await createCloudflareDnsRecord({
      zoneId: zone.id,
      name,
      type: record.type,
      content: value,
      proxied: false,
      ...(record.priority !== undefined ? { priority: record.priority } : {}),
    });
  }
  const dmarcName = `_dmarc.${root}`;
  if (
    !zone.subdomains.some(
      (candidate) =>
        candidate.name.toLowerCase().replace(/\.$/, "") === dmarcName &&
        candidate.type === "TXT",
    )
  ) {
    await createCloudflareDnsRecord({
      zoneId: zone.id,
      name: dmarcName,
      type: "TXT",
      content: "v=DMARC1; p=none;",
      proxied: false,
    });
  }
  invalidateCloudflareZones();
  await verifyResendDomain(domain.id);
  const verifiedDomain = await waitForResendDomainVerification(domain.id);
  const sendingKey =
    existingSendingKey ||
    (await createResendSendingKey({
      name: `Vendure ${root}`,
      domainId: domain.id,
    }));
  return { domain: verifiedDomain, sendingKey };
}
