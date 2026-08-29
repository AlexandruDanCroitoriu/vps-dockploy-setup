import { describe, expect, it } from "vitest";
import type { ResendDomain } from "@/lib/resend/domains";
import { isResendCloudflareRecord } from "./resend-records";

const domains: ResendDomain[] = [
  {
    id: "domain-1",
    name: "example.com",
    region: "us-east-1",
    status: "verified",
    records: [
      {
        record: "SPF",
        name: "send",
        type: "TXT",
        value: "v=spf1 include:amazonses.com ~all",
        status: "verified",
      },
    ],
  },
];

describe("isResendCloudflareRecord", () => {
  it("matches a Cloudflare record managed by Resend", () => {
    expect(
      isResendCloudflareRecord(
        {
          id: "record-1",
          name: "send.example.com",
          type: "TXT",
          content: '"v=spf1 include:amazonses.com ~all"',
          proxied: false,
        },
        domains,
      ),
    ).toBe(true);
  });

  it("keeps unrelated records with the same name", () => {
    expect(
      isResendCloudflareRecord(
        {
          id: "record-2",
          name: "send.example.com",
          type: "TXT",
          content: "unrelated-value",
          proxied: false,
        },
        domains,
      ),
    ).toBe(false);
  });
});
