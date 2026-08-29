import type { CloudflareDnsRecord } from "@/lib/cloudflare/zones";
import type { ResendDnsRecord, ResendDomain } from "@/lib/resend/domains";

export function normalizedResendRecordName(
  record: ResendDnsRecord,
  domain: string,
) {
  const name = record.name.trim().toLowerCase().replace(/\.$/, "");
  const root = domain.toLowerCase();
  if (name === "@" || name === root) return root;
  return name.endsWith(`.${root}`) ? name : `${name}.${root}`;
}

export function isResendCloudflareRecord(
  record: CloudflareDnsRecord,
  domains: ResendDomain[],
) {
  return domains.some((domain) =>
    domain.records.some(
      (resendRecord) =>
        record.name.toLowerCase().replace(/\.$/, "") ===
          normalizedResendRecordName(resendRecord, domain.name) &&
        record.type === resendRecord.type &&
        record.content.replace(/^"|"$/g, "") ===
          resendRecord.value.replace(/^"|"$/g, ""),
    ),
  );
}
