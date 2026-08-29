import {
  dummyPaymentHandler,
  DefaultJobQueuePlugin,
  DefaultSchedulerPlugin,
  DefaultSearchPlugin,
  VendureConfig,
} from "@vendure/core";
import {
  defaultEmailHandlers,
  EmailPlugin,
  FileBasedTemplateLoader,
} from "@vendure/email-plugin";
import {
  AssetServerPlugin,
  configureS3AssetStorage,
} from "@vendure/asset-server-plugin";
import { DashboardPlugin } from "@vendure/dashboard/plugin";
import { GraphiqlPlugin } from "@vendure/graphiql-plugin";
import "dotenv/config";
import path from "path";

const IS_DEV = process.env.APP_ENV !== "production";
// PORT wins because hosting platforms inject it into the environment at runtime, and that
// must take precedence over any value baked into the .env file at scaffold time.
const serverPort =
  +process.env.PORT || +process.env.VENDURE_SERVER_PORT || 3000;
const storefrontUrl = (
  process.env.VENDURE_STOREFRONT_URL || "http://localhost:8080"
).replace(/\/$/, "");
const storefrontDomain = new URL(storefrontUrl).host;

function conventionalCleanStorefrontUrl(primaryUrl: string) {
  const url = new URL(primaryUrl);
  if (url.hostname.startsWith("storefront.")) {
    url.hostname = url.hostname.replace(/^storefront\./, "storefront-clean.");
    return url.toString().replace(/\/$/, "");
  }
  return primaryUrl;
}

const storefrontCleanUrl = (
  process.env.VENDURE_STOREFRONT_CLEAN_URL ||
  conventionalCleanStorefrontUrl(storefrontUrl)
).replace(/\/$/, "");
const storefrontCleanDomain = new URL(storefrontCleanUrl).host;

function emailStorefront(requestHeader: string | string[] | undefined) {
  const identifier = Array.isArray(requestHeader)
    ? requestHeader[0]
    : requestHeader;
  return identifier === "storefront-clean"
    ? { url: storefrontCleanUrl, brandName: storefrontCleanDomain }
    : { url: storefrontUrl, brandName: storefrontDomain };
}

function productionEmailOptions() {
  const required = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "MAIL_FROM_ADDRESS",
  ] as const;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(
      `Production email configuration is incomplete: ${missing.join(", ")}`,
    );
  }
  return {
    transport: {
      type: "smtp" as const,
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
    },
  };
}

export const config: VendureConfig = {
  defaultChannelToken: process.env.VENDURE_CHANNEL_TOKEN || undefined,
  apiOptions: {
    port: serverPort,
    adminApiPath: "admin-api",
    shopApiPath: "shop-api",
    trustProxy: IS_DEV ? false : 1,
    // The following options are useful in development mode,
    // but are best turned off for production for security
    // reasons.
    ...(IS_DEV
      ? {
          adminApiDebug: true,
          shopApiDebug: true,
        }
      : {}),
  },
  authOptions: {
    tokenMethod: ["bearer", "cookie"],
    superadminCredentials: {
      identifier: process.env.SUPERADMIN_USERNAME,
      password: process.env.SUPERADMIN_PASSWORD,
    },
    cookieOptions: {
      secret: process.env.COOKIE_SECRET,
    },
  },
  dbConnectionOptions: {
    type: "postgres",
    // See the README.md "Migrations" section for an explanation of
    // the `synchronize` and `migrations` options.
    synchronize: false,
    migrations: [path.join(__dirname, "./migrations/*.+(js|ts)")],
    logging: false,
    database: process.env.DB_NAME,
    schema: process.env.DB_SCHEMA,
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  },
  paymentOptions: {
    paymentMethodHandlers: [dummyPaymentHandler],
  },
  // When adding or altering custom field definitions, the database will
  // need to be updated. See the "Migrations" section in README.md.
  customFields: {},
  plugins: [
    GraphiqlPlugin.init(),
    AssetServerPlugin.init({
      route: "assets",
      assetUploadDir: path.join(__dirname, "../static/assets"),

      assetUrlPrefix: IS_DEV ? undefined : process.env.ASSET_URL_PREFIX,

      storageStrategyFactory: process.env.S3_BUCKET
        ? configureS3AssetStorage({
            bucket: process.env.S3_BUCKET,
            credentials: {
              accessKeyId: process.env.S3_ACCESS_KEY_ID!,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
            },
            nativeS3Configuration: {
              endpoint: process.env.S3_ENDPOINT,
              region: process.env.S3_REGION || "garage",
              forcePathStyle: true,
              signatureVersion: "v4",
            },
          })
        : undefined,
    }),
    DefaultSchedulerPlugin.init(),
    DefaultJobQueuePlugin.init({ useDatabaseForBuffer: true }),
    DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
    EmailPlugin.init({
      ...(IS_DEV
        ? {
            devMode: true as const,
            outputPath: path.join(__dirname, "../static/email/test-emails"),
            route: "mailbox",
          }
        : productionEmailOptions()),
      handlers: defaultEmailHandlers,
      templateLoader: new FileBasedTemplateLoader(
        path.join(__dirname, "../static/email/templates"),
      ),
      globalTemplateVars: async (ctx) => {
        const storefront = emailStorefront(
          ctx.req?.headers["x-vendure-storefront"],
        );
        return {
          brandName: storefront.brandName,
          fromAddress: IS_DEV
            ? `"${storefront.brandName} development" <noreply@example.com>`
            : `"${storefront.brandName}" <${process.env.MAIL_FROM_ADDRESS}>`,
          verifyEmailAddressUrl: `${storefront.url}/verify`,
          passwordResetUrl: `${storefront.url}/password-reset`,
          changeEmailAddressUrl: `${storefront.url}/verify-email-address-change`,
        };
      },
    }),
    DashboardPlugin.init({
      route: "dashboard",
      appDir: IS_DEV
        ? path.join(__dirname, "../dist/dashboard")
        : path.join(__dirname, "dashboard"),
    }),
  ],
};
