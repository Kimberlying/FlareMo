import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseSecretNames,
  parseWhoamiAccountIds,
  parseWorkerConfig,
} from "./setup-usage.mjs";

test("parseWorkerConfig extracts worker name, D1 id and R2 bucket from JSONC", () => {
  const text = `{
  // deploy config, keep secrets out
  "name": "flaremo",
  "main": "./apps/worker/src/index.ts",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "flaremo",
      "database_id": "5a5094d8-efcc-4aef-909b-c8455358247d"
    }
  ],
  "r2_buckets": [
    {
      "binding": "ATTACHMENTS",
      "bucket_name": "flaremo-attachments"
    }
  ]
}`;
  assert.deepEqual(parseWorkerConfig(text), {
    name: "flaremo",
    databaseId: "5a5094d8-efcc-4aef-909b-c8455358247d",
    bucketName: "flaremo-attachments",
  });
});

test("parseWorkerConfig tolerates missing sections", () => {
  assert.deepEqual(parseWorkerConfig('{"name": "x"}'), {
    name: "x",
    databaseId: "",
    bucketName: "",
  });
  assert.deepEqual(parseWorkerConfig(""), {
    name: "",
    databaseId: "",
    bucketName: "",
  });
});

test("parseWhoamiAccountIds reads labeled account ids", () => {
  const output = [
    "⛅️ wrangler 4.40.0",
    "------------------",
    "Getting User settings...",
    "👤 User: kim@example.com",
    "ligen_twrn_c6y",
    "🏦 Account Name: Kosxai",
    "├ ─ Account ID: aabbccdd11223344aabbccdd11223344",
    "🏦 Account Name: Personal",
    "└ ─ Account ID: 1122334455667788aabbccdd11223344",
  ].join("\n");
  assert.deepEqual(parseWhoamiAccountIds(output), [
    "aabbccdd11223344aabbccdd11223344",
    "1122334455667788aabbccdd11223344",
  ]);
});

test("parseWhoamiAccountIds falls back to bare 32-hex tokens", () => {
  assert.deepEqual(
    parseWhoamiAccountIds("account: 00000000ffff00008888888899999999"),
    ["00000000ffff00008888888899999999"],
  );
  assert.deepEqual(parseWhoamiAccountIds("no ids here"), []);
});

test("parseSecretNames extracts names from wrangler secret list output", () => {
  const json = JSON.stringify([
    { name: "BETTER_AUTH_SECRET", type: "secret_text" },
    { name: "FLAREMO_CF_ANALYTICS_TOKEN", type: "secret_text" },
  ]);
  assert.deepEqual(parseSecretNames(`noise before\n${json}\nnoise after`), [
    "BETTER_AUTH_SECRET",
    "FLAREMO_CF_ANALYTICS_TOKEN",
  ]);
  assert.deepEqual(parseSecretNames("not json at all"), []);
  assert.deepEqual(parseSecretNames("[]"), []);
});
