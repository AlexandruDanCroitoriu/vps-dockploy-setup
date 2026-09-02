import { CircleStackIcon } from "@heroicons/react/24/outline";

import {
  CloudflareR2ConfigurationError,
  listCloudflareR2Buckets,
  type CloudflareR2Bucket,
} from "@/lib/cloudflare/r2";

import { R2Buckets } from "./r2-buckets";
import { getR2BucketDestinationStatuses } from "@/lib/dokploy/r2-destinations";

export const dynamic = "force-dynamic";

export default async function R2Page() {
  let buckets: CloudflareR2Bucket[] = [];
  let error = "";
  let destinationStatuses: Awaited<
    ReturnType<typeof getR2BucketDestinationStatuses>
  > = [];
  try {
    buckets = await listCloudflareR2Buckets();
    destinationStatuses = await getR2BucketDestinationStatuses(
      buckets.map((bucket) => bucket.name),
    );
  } catch (cause) {
    error =
      cause instanceof CloudflareR2ConfigurationError
        ? "Set CLOUDFLARE_ACCOUNT_ID and a CLOUDFLARE_API_TOKEN with Workers R2 Storage:Edit permission."
        : cause instanceof Error
          ? cause.message
          : "Unable to load R2 buckets.";
  }
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center gap-3">
        <CircleStackIcon
          className="size-7 text-indigo-500"
          aria-hidden="true"
        />
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Cloudflare R2
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Create and remove buckets in the configured Cloudflare account.
          </p>
        </div>
      </div>
      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
        >
          {error}
        </div>
      ) : (
        <R2Buckets
          buckets={buckets}
          destinationStatuses={destinationStatuses}
        />
      )}
    </div>
  );
}
