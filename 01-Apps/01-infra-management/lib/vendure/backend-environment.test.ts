import { describe, expect, it } from "vitest";

import {
  getVendureEmailEnvironment,
  getVendurePostgresEnvironment,
  getVendureStorageEnvironment,
  isVendureBackendService,
  removeVendureEmailEnvironment,
} from "./backend-environment";

describe("Vendure backend environment", () => {
  it("maps Dokploy PostgreSQL credentials to Vendure variables", () => {
    expect(
      getVendurePostgresEnvironment("", [
        {
          id: "postgres-1",
          name: "shop database",
          appName: "postgres-internal",
          env: "",
          serverId: null,
          sourcePath: null,
          type: "postgres",
          status: "running",
          credentials: [
            { label: "Internal Host", value: "postgres-internal" },
            { label: "Internal Port", value: "5432" },
            { label: "Database Name", value: "vendure" },
            { label: "User", value: "vendure-user" },
            { label: "Password", value: "secret", secret: true },
          ],
        },
      ]),
    ).toEqual({
      DB_HOST: "postgres-internal",
      DB_PORT: "5432",
      DB_NAME: "vendure",
      DB_USERNAME: "vendure-user",
      DB_PASSWORD: "secret",
      DB_SCHEMA: "public",
    });
  });

  it("requires PostgreSQL in the selected environment", () => {
    expect(() => getVendurePostgresEnvironment("", [])).toThrow(
      "project environment",
    );
  });

  it("prefers PostgreSQL variables stored in the project environment", () => {
    expect(
      getVendurePostgresEnvironment(
        [
          'POSTGRES_HOST="postgres.internal"',
          'POSTGRES_PORT="5432"',
          'POSTGRES_DATABASE="shop"',
          'POSTGRES_USER="shop-user"',
          'POSTGRES_PASSWORD="secret"',
        ].join("\n"),
        [],
      ),
    ).toEqual({
      DB_HOST: "postgres.internal",
      DB_PORT: "5432",
      DB_NAME: "shop",
      DB_USERNAME: "shop-user",
      DB_PASSWORD: "secret",
      DB_SCHEMA: "public",
    });
  });

  it("copies configured Garage storage values from the project environment", () => {
    expect(
      getVendureStorageEnvironment(
        [
          'ASSET_URL_PREFIX="https://vendure.example.com/assets/"',
          'S3_ENDPOINT="https://s3.example.com"',
          'S3_REGION="garage"',
          'S3_BUCKET="vendure-assets"',
          'S3_ACCESS_KEY_ID="access-key"',
          'S3_SECRET_ACCESS_KEY="secret-key"',
          'UNRELATED_VALUE="do-not-copy"',
        ].join("\n"),
      ),
    ).toEqual({
      ASSET_URL_PREFIX: "https://vendure.example.com/assets/",
      S3_ENDPOINT: "https://s3.example.com",
      S3_REGION: "garage",
      S3_BUCKET: "vendure-assets",
      S3_ACCESS_KEY_ID: "access-key",
      S3_SECRET_ACCESS_KEY: "secret-key",
    });
  });

  it("copies only managed email values from the project environment", () => {
    expect(
      getVendureEmailEnvironment(
        [
          'SMTP_HOST="smtp.resend.com"',
          'SMTP_PORT="465"',
          'SMTP_SECURE="true"',
          'SMTP_USERNAME="resend"',
          'SMTP_PASSWORD="re_sending-key"',
          'MAIL_FROM_ADDRESS="account@example.com"',
          'VENDURE_STOREFRONT_URL="https://storefront.example.com"',
          'VENDURE_STOREFRONT_CLEAN_URL="https://storefront-clean.example.com"',
          'UNRELATED_VALUE="ignored"',
        ].join("\n"),
      ),
    ).toEqual({
      SMTP_HOST: "smtp.resend.com",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USERNAME: "resend",
      SMTP_PASSWORD: "re_sending-key",
      MAIL_FROM_ADDRESS: "account@example.com",
      VENDURE_STOREFRONT_URL: "https://storefront.example.com",
      VENDURE_STOREFRONT_CLEAN_URL: "https://storefront-clean.example.com",
    });
  });

  it("removes all project email values owned by a Vendure backend", () => {
    expect(
      removeVendureEmailEnvironment(
        [
          'POSTGRES_HOST="postgres.internal"',
          'SMTP_HOST="smtp.resend.com"',
          'SMTP_PORT="465"',
          'SMTP_SECURE="true"',
          'SMTP_USERNAME="resend"',
          'SMTP_PASSWORD="re_sending-key"',
          'MAIL_FROM_ADDRESS="account@example.com"',
          'MAIL_FROM_NAME="storefront.example.com"',
          'VENDURE_STOREFRONT_URL="https://storefront.example.com"',
          'VENDURE_STOREFRONT_CLEAN_URL="https://storefront-clean.example.com"',
          'S3_BUCKET="vendure-assets"',
        ].join("\n"),
      ),
    ).toBe(
      ['POSTGRES_HOST="postgres.internal"', 'S3_BUCKET="vendure-assets"'].join(
        "\n",
      ),
    );
  });

  it("recognizes image-based and repository-based Vendure backends", () => {
    expect(
      isVendureBackendService({
        type: "applications",
        name: "vendure",
        sourcePath: null,
      }),
    ).toBe(true);
    expect(
      isVendureBackendService({
        type: "applications",
        name: "custom-name",
        sourcePath: "/01-Apps/02-Online-Store-Vendure/apps/server",
      }),
    ).toBe(true);
    expect(
      isVendureBackendService({
        type: "applications",
        name: "vendure-storefront",
        sourcePath: null,
      }),
    ).toBe(false);
  });
});
