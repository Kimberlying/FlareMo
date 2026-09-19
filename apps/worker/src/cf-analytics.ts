import type { FlareMoEnv } from "./env";

// Cloudflare GraphQL Analytics client backing the owner usage panel. Reports
// official account-level usage for this deployment's own resources (Worker
// invocations, D1 reads/writes/storage, R2 storage/operations) instead of
// in-app estimates. Requires the FLAREMO_CF_* secrets written by
// `pnpm setup:usage`; the token only needs the "Account Analytics: Read"
// permission. The token is account-scoped, so every query filters down to
// this deployment's own resources (script name, database id, bucket name).

const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const CACHE_TTL_MS = 60 * 60 * 1000;

export type CloudflareUsageWindow = { since: string; until: string };

export type CloudflareUsageReport = {
  window: CloudflareUsageWindow;
  /** Non-fatal per-section problems (e.g. one dataset unavailable). */
  errors: string[];
  workers: {
    requests: number;
    subrequests: number;
    errors: number;
  } | null;
  d1: {
    storageBytes: number | null;
    rowsRead: number;
    rowsWritten: number;
  } | null;
  r2: {
    storageBytes: number | null;
    objectCount: number | null;
    classAOps: number;
    classBOps: number;
  } | null;
};

type AnalyticsConfig = {
  token: string;
  accountId: string;
  workerName: string;
  d1DatabaseId: string;
  r2Bucket: string;
};

export function resolveAnalyticsConfig(
  env: FlareMoEnv,
): AnalyticsConfig | null {
  const token = env.FLAREMO_CF_ANALYTICS_TOKEN?.trim();
  const accountId = env.FLAREMO_CF_ACCOUNT_ID?.trim();
  if (!token || !accountId) return null;
  return {
    token,
    accountId,
    workerName: env.FLAREMO_CF_WORKER_NAME?.trim() ?? "",
    d1DatabaseId: env.FLAREMO_CF_D1_ID?.trim() ?? "",
    r2Bucket: env.FLAREMO_CF_R2_BUCKET?.trim() ?? "",
  };
}

export function currentUtcMonthWindow(now = new Date()): CloudflareUsageWindow {
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  return { since, until: now.toISOString() };
}

const WORKERS_QUERY = `
query($accountTag: string!, $scriptName: string!, $since: Time!, $until: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      invocations: workersInvocationsAdaptive(
        limit: 10000
        filter: { scriptName: $scriptName, datetime_geq: $since, datetime_leq: $until }
      ) {
        sum { requests subrequests errors }
      }
    }
  }
}`;

const D1_QUERY = `
query($accountTag: string!, $databaseId: string!, $since: Date!, $until: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      analytics: d1AnalyticsAdaptiveGroups(
        limit: 10000
        filter: { databaseId: $databaseId, date_geq: $since, date_leq: $until }
      ) {
        sum { rowsRead rowsWritten readQueries writeQueries }
      }
      storage: d1StorageAdaptiveGroups(
        limit: 1
        filter: { databaseId: $databaseId, date_geq: $since, date_leq: $until }
        orderBy: [date_DESC]
      ) {
        max { databaseSizeBytes }
      }
    }
  }
}`;

const R2_QUERY = `
query($accountTag: string!, $bucketName: string!, $since: Time!, $until: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      storage: r2StorageAdaptiveGroups(
        limit: 1
        filter: { bucketName: $bucketName, datetime_geq: $since, datetime_leq: $until }
        orderBy: [datetime_DESC]
      ) {
        max { payloadSize metadataSize objectCount }
      }
      ops: r2OperationsAdaptiveGroups(
        limit: 10000
        filter: { bucketName: $bucketName, datetime_geq: $since, datetime_leq: $until }
      ) {
        sum { requests }
        dimensions { actionType }
      }
    }
  }
}`;

type GraphQLResponse = {
  errors?: { message: string }[];
  data?: {
    viewer?: {
      accounts?: {
        invocations?: {
          sum?: Partial<Record<"requests" | "subrequests" | "errors", number>>;
        }[];
        analytics?: {
          sum?: Partial<
            Record<
              "rowsRead" | "rowsWritten" | "readQueries" | "writeQueries",
              number
            >
          >;
        }[];
        storage?: {
          max?: Partial<
            Record<
              | "databaseSizeBytes"
              | "payloadSize"
              | "metadataSize"
              | "objectCount",
              number
            >
          >;
        }[];
        ops?: {
          sum?: { requests?: number };
          dimensions?: { actionType?: string };
        }[];
      }[];
    };
  };
};

async function graphqlQuery(
  token: string,
  query: string,
  variables: Record<string, string>,
): Promise<GraphQLResponse["data"]> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`Cloudflare GraphQL API returned HTTP ${response.status}`);
  }
  const payload = (await response.json()) as GraphQLResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }
  return payload.data;
}

// Class A = write-type operations per https://developers.cloudflare.com/r2/pricing/.
// Everything not listed (GetObject, HeadObject, UsageSummary, ...) is Class B;
// DeleteObject / AbortMultipartUpload are free but land in B here, which only
// ever overstates usage slightly.
const R2_CLASS_A_ACTIONS = new Set([
  "ListBuckets",
  "PutBucket",
  "ListObjects",
  "PutObject",
  "CopyObject",
  "CompleteMultipartUpload",
  "CreateMultipartUpload",
  "UploadPart",
  "UploadPartCopy",
  "ListParts",
  "LifecycleStorageTierTransition",
  "ListMultipartUploads",
  "PutBucketEncryption",
  "PutBucketCors",
  "PutBucketLifecycleConfiguration",
]);

export function classifyR2Action(actionType: string): "a" | "b" {
  return R2_CLASS_A_ACTIONS.has(actionType) ? "a" : "b";
}

const ACCOUNT_PATH = "viewer.accounts.0";

function pick(data: GraphQLResponse["data"], path: string): unknown {
  let current: unknown = data;
  for (const segment of path.split(".")) {
    if (current == null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return current ?? null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchWorkersUsage(
  config: AnalyticsConfig,
  window: CloudflareUsageWindow,
): Promise<{ section: CloudflareUsageReport["workers"]; error?: string }> {
  if (!config.workerName) return { section: null };
  try {
    const data = await graphqlQuery(config.token, WORKERS_QUERY, {
      accountTag: config.accountId,
      scriptName: config.workerName,
      since: window.since,
      until: window.until,
    });
    const sum = pick(data, `${ACCOUNT_PATH}.invocations.0.sum`);
    return {
      section: {
        requests: numberOr(
          (sum as Record<string, unknown> | null)?.requests,
          0,
        ),
        subrequests: numberOr(
          (sum as Record<string, unknown> | null)?.subrequests,
          0,
        ),
        errors: numberOr((sum as Record<string, unknown> | null)?.errors, 0),
      },
    };
  } catch (error) {
    return { section: null, error: `Workers: ${errorMessage(error)}` };
  }
}

async function fetchD1Usage(
  config: AnalyticsConfig,
  window: CloudflareUsageWindow,
): Promise<{ section: CloudflareUsageReport["d1"]; error?: string }> {
  if (!config.d1DatabaseId) return { section: null };
  const since = window.since.slice(0, 10);
  const until = window.until.slice(0, 10);
  try {
    const data = await graphqlQuery(config.token, D1_QUERY, {
      accountTag: config.accountId,
      databaseId: config.d1DatabaseId,
      since,
      until,
    });
    const analytics = pick(data, `${ACCOUNT_PATH}.analytics.0.sum`) as Record<
      string,
      unknown
    > | null;
    const storage = pick(data, `${ACCOUNT_PATH}.storage.0.max`) as Record<
      string,
      unknown
    > | null;
    return {
      section: {
        storageBytes: nullableNumber(storage?.databaseSizeBytes),
        rowsRead: numberOr(analytics?.rowsRead, 0),
        rowsWritten: numberOr(analytics?.rowsWritten, 0),
      },
    };
  } catch (error) {
    return { section: null, error: `D1: ${errorMessage(error)}` };
  }
}

async function fetchR2Usage(
  config: AnalyticsConfig,
  window: CloudflareUsageWindow,
): Promise<{ section: CloudflareUsageReport["r2"]; error?: string }> {
  if (!config.r2Bucket) return { section: null };
  try {
    // R2 datasets filter on datetime (Time), unlike D1 which uses date.
    const data = await graphqlQuery(config.token, R2_QUERY, {
      accountTag: config.accountId,
      bucketName: config.r2Bucket,
      since: window.since,
      until: window.until,
    });
    const storage = pick(data, `${ACCOUNT_PATH}.storage.0.max`) as Record<
      string,
      unknown
    > | null;
    const ops = (pick(data, `${ACCOUNT_PATH}.ops`) ?? []) as {
      sum?: { requests?: number };
      dimensions?: { actionType?: string };
    }[];
    let classAOps = 0;
    let classBOps = 0;
    for (const group of ops) {
      const bucket = classifyR2Action(group.dimensions?.actionType ?? "");
      const requests = numberOr(group.sum?.requests, 0);
      if (bucket === "a") classAOps += requests;
      else classBOps += requests;
    }
    return {
      section: {
        storageBytes: nullableNumber(storage?.payloadSize),
        objectCount: nullableNumber(storage?.objectCount),
        classAOps,
        classBOps,
      },
    };
  } catch (error) {
    return { section: null, error: `R2: ${errorMessage(error)}` };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let cache: {
  key: string;
  at: number;
  report: CloudflareUsageReport;
} | null = null;

export function resetCloudflareUsageCacheForTests() {
  cache = null;
}

export async function fetchCloudflareUsage(
  env: FlareMoEnv,
  options: { force?: boolean; now?: Date } = {},
): Promise<CloudflareUsageReport> {
  const config = resolveAnalyticsConfig(env);
  if (!config) throw new Error("Cloudflare analytics is not configured.");
  const now = options.now ?? new Date();
  // Token is part of the key so a swapped token (setup:usage --reset) never
  // serves up to an hour of stale data minted under the old credential.
  const key = `${config.accountId}:${config.token}`;
  if (
    !options.force &&
    cache &&
    cache.key === key &&
    now.getTime() - cache.at < CACHE_TTL_MS
  ) {
    return cache.report;
  }

  const window = currentUtcMonthWindow(now);
  const [workers, d1, r2] = await Promise.all([
    fetchWorkersUsage(config, window),
    fetchD1Usage(config, window),
    fetchR2Usage(config, window),
  ]);
  const errors = [workers.error, d1.error, r2.error].filter(
    (error): error is string => Boolean(error),
  );
  const report: CloudflareUsageReport = {
    window,
    errors,
    workers: workers.section,
    d1: d1.section,
    r2: r2.section,
  };
  cache = { key, at: now.getTime(), report };
  return report;
}
