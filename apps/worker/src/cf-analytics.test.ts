import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyR2Action,
  currentUtcMonthWindow,
  fetchCloudflareUsage,
  resetCloudflareUsageCacheForTests,
  resolveAnalyticsConfig,
} from "./cf-analytics";
import type { FlareMoEnv } from "./env";

function analyticsEnv(overrides: Partial<FlareMoEnv> = {}): FlareMoEnv {
  return {
    FLAREMO_CF_ANALYTICS_TOKEN: "test-token",
    FLAREMO_CF_ACCOUNT_ID: "a".repeat(32),
    FLAREMO_CF_WORKER_NAME: "flaremo",
    FLAREMO_CF_D1_ID: "5a5094d8-efcc-4aef-909b-c8455358247d",
    FLAREMO_CF_R2_BUCKET: "flaremo-attachments",
    ...overrides,
  } as FlareMoEnv;
}

const okEnvelope = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ data }),
});

function accountsPayload(fields: Record<string, unknown>) {
  return { viewer: { accounts: [fields] } };
}

const now = new Date("2026-09-19T12:00:00Z");

describe("resolveAnalyticsConfig", () => {
  it("returns null when token or account id is missing", () => {
    expect(resolveAnalyticsConfig(analyticsEnv())).not.toBeNull();
    expect(
      resolveAnalyticsConfig(analyticsEnv({ FLAREMO_CF_ACCOUNT_ID: "" })),
    ).toBeNull();
    expect(
      resolveAnalyticsConfig(analyticsEnv({ FLAREMO_CF_ANALYTICS_TOKEN: " " })),
    ).toBeNull();
  });

  it("trims values and keeps optional resource ids", () => {
    const config = resolveAnalyticsConfig(
      analyticsEnv({ FLAREMO_CF_WORKER_NAME: " flaremo " }),
    );
    expect(config?.workerName).toBe("flaremo");
    expect(config?.d1DatabaseId).toBe("5a5094d8-efcc-4aef-909b-c8455358247d");
    expect(config?.r2Bucket).toBe("flaremo-attachments");
  });
});

describe("currentUtcMonthWindow", () => {
  it("starts at the first day of the UTC month", () => {
    expect(currentUtcMonthWindow(now)).toEqual({
      since: "2026-09-01T00:00:00.000Z",
      until: "2026-09-19T12:00:00.000Z",
    });
  });
});

describe("classifyR2Action", () => {
  it("maps pricing-doc Class A operations to 'a'", () => {
    for (const action of [
      "PutObject",
      "CopyObject",
      "ListObjects",
      "CompleteMultipartUpload",
      "PutBucketCors",
    ]) {
      expect(classifyR2Action(action)).toBe("a");
    }
  });

  it("maps read and free operations to 'b'", () => {
    for (const action of ["GetObject", "HeadObject", "UsageSummary", ""]) {
      expect(classifyR2Action(action)).toBe("b");
    }
  });
});

describe("fetchCloudflareUsage", () => {
  beforeEach(() => {
    resetCloudflareUsageCacheForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when analytics is not configured", async () => {
    await expect(
      fetchCloudflareUsage({} as FlareMoEnv, { now }),
    ).rejects.toThrow("not configured");
  });

  it("aggregates workers, D1 and R2 sections from GraphQL responses", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes("workersInvocationsAdaptive")) {
        return okEnvelope(
          accountsPayload({
            invocations: [
              { sum: { requests: 1200, subrequests: 300, errors: 2 } },
            ],
          }),
        );
      }
      if (body.query.includes("d1AnalyticsAdaptiveGroups")) {
        return okEnvelope(
          accountsPayload({
            analytics: [
              {
                sum: {
                  rowsRead: 5000,
                  rowsWritten: 40,
                  readQueries: 9,
                  writeQueries: 3,
                },
              },
            ],
            storage: [{ max: { databaseSizeBytes: 1048576 } }],
          }),
        );
      }
      return okEnvelope(
        accountsPayload({
          storage: [
            { max: { payloadSize: 2048, metadataSize: 64, objectCount: 12 } },
          ],
          ops: [
            { sum: { requests: 30 }, dimensions: { actionType: "PutObject" } },
            { sum: { requests: 400 }, dimensions: { actionType: "GetObject" } },
            {
              sum: { requests: 7 },
              dimensions: { actionType: "DeleteObject" },
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await fetchCloudflareUsage(analyticsEnv(), { now });
    expect(report.errors).toEqual([]);
    expect(report.workers).toEqual({
      requests: 1200,
      subrequests: 300,
      errors: 2,
    });
    expect(report.d1).toEqual({
      storageBytes: 1048576,
      rowsRead: 5000,
      rowsWritten: 40,
    });
    expect(report.r2).toEqual({
      storageBytes: 2048,
      objectCount: 12,
      classAOps: 30,
      classBOps: 407,
    });

    // D1/R2 date filters stay day-granular; workers uses full timestamps and
    // every query is scoped to this deployment's own resources.
    const workersBody = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    ) as { variables: Record<string, string> };
    expect(workersBody.variables.scriptName).toBe("flaremo");
    expect(workersBody.variables.since).toBe("2026-09-01T00:00:00.000Z");
    const d1Body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as {
      variables: Record<string, string>;
    };
    expect(d1Body.variables.databaseId).toBe(
      "5a5094d8-efcc-4aef-909b-c8455358247d",
    );
    expect(d1Body.variables.since).toBe("2026-09-01");
    const r2Body = JSON.parse(String(fetchMock.mock.calls[2][1]?.body)) as {
      variables: Record<string, string>;
    };
    expect(r2Body.variables.bucketName).toBe("flaremo-attachments");
    // R2 datasets filter on datetime (Time), unlike D1's date filters.
    expect(r2Body.variables.since).toBe("2026-09-01T00:00:00.000Z");
  });

  it("isolates per-section failures and keeps the rest of the report", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes("workersInvocationsAdaptive")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ errors: [{ message: "boom" }] }),
        };
      }
      if (body.query.includes("d1AnalyticsAdaptiveGroups")) {
        return okEnvelope(
          accountsPayload({
            analytics: [{ sum: { rowsRead: 1, rowsWritten: 2 } }],
            storage: [],
          }),
        );
      }
      return okEnvelope(accountsPayload({ storage: [], ops: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await fetchCloudflareUsage(analyticsEnv(), { now });
    expect(report.workers).toBeNull();
    expect(report.errors).toEqual(["Workers: boom"]);
    expect(report.d1).toEqual({
      storageBytes: null,
      rowsRead: 1,
      rowsWritten: 2,
    });
    expect(report.r2).toEqual({
      storageBytes: null,
      objectCount: null,
      classAOps: 0,
      classBOps: 0,
    });
  });

  it("skips sections whose resource ids are not configured", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("should not be called");
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await fetchCloudflareUsage(
      analyticsEnv({
        FLAREMO_CF_WORKER_NAME: "",
        FLAREMO_CF_D1_ID: "",
        FLAREMO_CF_R2_BUCKET: "",
      }),
      { now },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(report.workers).toBeNull();
    expect(report.d1).toBeNull();
    expect(report.r2).toBeNull();
    expect(report.errors).toEqual([]);
  });

  it("caches the report for one hour", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string };
      return okEnvelope(
        accountsPayload(
          body.query.includes("workersInvocationsAdaptive")
            ? { invocations: [{ sum: { requests: 5 } }] }
            : { storage: [], ops: [], analytics: [] },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCloudflareUsage(analyticsEnv(), { now });
    await fetchCloudflareUsage(analyticsEnv(), { now });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    resetCloudflareUsageCacheForTests();
    await fetchCloudflareUsage(analyticsEnv(), { now, force: true });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
