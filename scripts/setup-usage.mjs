#!/usr/bin/env node

// One-time bootstrap for the owner usage panel's Cloudflare resource section
// (see apps/worker/src/cf-analytics.ts). Detects whether the Worker secrets
// exist, walks the operator through creating an "Account Analytics: Read" API
// token, uploads the secrets, and verifies the token against the GraphQL
// Analytics API. Re-running is safe: existing secrets are skipped unless
// --reset is passed (which re-prompts for the token only).

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const WRANGLER_CONFIG = "./wrangler.jsonc";
const TOKEN_DASHBOARD_URL = "https://dash.cloudflare.com/profile/api-tokens";

const SECRET_NAMES = {
  token: "FLAREMO_CF_ANALYTICS_TOKEN",
  accountId: "FLAREMO_CF_ACCOUNT_ID",
  workerName: "FLAREMO_CF_WORKER_NAME",
  d1Id: "FLAREMO_CF_D1_ID",
  r2Bucket: "FLAREMO_CF_R2_BUCKET",
};

export function parseWorkerConfig(text) {
  const name = text.match(/"name"\s*:\s*"([^"]+)"/)?.[1] ?? "";
  const databaseId = text.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1] ?? "";
  const bucketName = text.match(/"bucket_name"\s*:\s*"([^"]+)"/)?.[1] ?? "";
  return { name, databaseId, bucketName };
}

export function parseWhoamiAccountIds(output) {
  const ids = new Set();
  const labeled = output.matchAll(/Account ID:?\s*([0-9a-fA-F]{32})/g);
  for (const match of labeled) ids.add(match[1]);
  if (ids.size === 0) {
    for (const match of output.matchAll(/\b([0-9a-f]{32})\b/g))
      ids.add(match[1]);
  }
  return [...ids];
}

export function parseSecretNames(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(output.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (typeof entry?.name === "string" ? entry.name : null))
      .filter((name) => name !== null);
  } catch {
    return [];
  }
}

function runWrangler(args, options = {}) {
  const result = spawnSync(
    "pnpm",
    ["exec", "wrangler", ...args, "--config", WRANGLER_CONFIG],
    {
      encoding: "utf8",
      env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
      input: options.input,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return { status: result.status ?? 1, output };
}

function putSecret(name, value) {
  const result = runWrangler(["secret", "put", name], { input: `${value}\n` });
  if (result.status === 0) return;
  const redacted = result.output.replaceAll(value, "[redacted]");
  throw new Error(
    `wrangler secret put ${name} failed:\n${redacted}\n\n` +
      "Is the Worker already deployed? Run a deploy once before configuring secrets.",
  );
}

async function main() {
  const reset = process.argv.includes("--reset");

  console.log(
    "FlareMo usage panel — Cloudflare resource analytics bootstrap\n",
  );

  const config = parseWorkerConfig(
    readFileSync(resolve(process.cwd(), WRANGLER_CONFIG), "utf8"),
  );

  // 1. Wrangler login + account selection.
  const whoami = runWrangler(["whoami"]);
  if (whoami.status !== 0) {
    throw new Error(`wrangler whoami failed:\n${whoami.output}`);
  }
  const accounts = parseWhoamiAccountIds(whoami.output);
  if (accounts.length === 0) {
    throw new Error(
      "No Cloudflare account found. Run `pnpm exec wrangler login` first.",
    );
  }
  let accountId = accounts[0];
  const pinned = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (accounts.length > 1) {
    if (pinned && accounts.includes(pinned)) {
      accountId = pinned;
      console.log(`Using CLOUDFLARE_ACCOUNT_ID=${accountId}.`);
    } else if (!process.stdin.isTTY) {
      throw new Error(
        "Multiple Cloudflare accounts are visible; run this script in a terminal to pick one, or set CLOUDFLARE_ACCOUNT_ID.",
      );
    } else {
      console.log("Multiple accounts are visible:");
      accounts.forEach((id, index) => {
        console.log(`  ${index + 1}. ${id}`);
      });
      const pickedIndex = await prompt(`Select account [1-${accounts.length}]: `);
      const picked = accounts[Number.parseInt(pickedIndex, 10) - 1];
      if (!picked) throw new Error("Invalid account selection.");
      accountId = picked;
    }
  }

  // 2. Current secret state.
  const list = runWrangler(["secret", "list"]);
  const existing = list.status === 0 ? parseSecretNames(list.output) : [];
  const missing = (key) => !existing.includes(SECRET_NAMES[key]);
  const tokenConfigured = existing.includes(SECRET_NAMES.token);

  // 3. Token.
  let token = process.env.FLAREMO_CF_ANALYTICS_TOKEN?.trim() ?? "";
  const needsTokenInput = !(tokenConfigured && !reset && !token) && !token;
  if (needsTokenInput && !process.stdin.isTTY) {
    throw new Error(
      "Token input needs a terminal, or set FLAREMO_CF_ANALYTICS_TOKEN for non-interactive runs.",
    );
  }
  if (tokenConfigured && !reset && !token) {
    console.log(
      `${SECRET_NAMES.token} is already set; keeping it (use --reset to replace).`,
    );
  } else if (token) {
    console.log(`${SECRET_NAMES.token} provided via environment; skipping prompt.`);
  } else {
    console.log(
      [
        "",
        'An API token with the "Account Analytics: Read" permission is required.',
        `1. Open ${TOKEN_DASHBOARD_URL}`,
        "2. Create Token -> Create Custom Token:",
        "   - Account permissions: Account -> Account Analytics -> Read",
        "   - Account resources: include -> your deployment's account",
        "3. Copy the token value and paste it below.",
        "",
      ].join("\n"),
    );
    token = await promptHidden(`${SECRET_NAMES.token}: `);
    if (!token) throw new Error("No token entered; aborting without changes.");
  }

  // 4. Upload missing secrets.
  const toUpload = [];
  if (
    (!tokenConfigured || reset || process.env.FLAREMO_CF_ANALYTICS_TOKEN) &&
    token
  ) {
    toUpload.push([SECRET_NAMES.token, token]);
  }
  if (missing("accountId")) toUpload.push([SECRET_NAMES.accountId, accountId]);
  if (missing("workerName") && config.name) {
    toUpload.push([SECRET_NAMES.workerName, config.name]);
  }
  if (
    missing("d1Id") &&
    config.databaseId &&
    !/^0{4}|placeholder/.test(config.databaseId)
  ) {
    toUpload.push([SECRET_NAMES.d1Id, config.databaseId]);
  }
  if (missing("r2Bucket") && config.bucketName) {
    toUpload.push([SECRET_NAMES.r2Bucket, config.bucketName]);
  }
  for (const [name, value] of toUpload) {
    putSecret(name, value);
    console.log(`Uploaded ${name}.`);
  }
  if (toUpload.length === 0) console.log("All secrets already present.");

  // 5. Verify the token can actually read analytics.
  const verify = await verifyToken(token || "", accountId);
  if (!verify.ok) {
    console.error(`\nVerification failed: ${verify.error}`);
    console.error(
      "The panel stays hidden until a working token is configured. Check the token's Account Analytics: Read permission and try again.",
    );
    process.exit(1);
  }
  console.log(
    "\nDone. The usage panel now shows Cloudflare resource usage (Workers / D1 / R2).",
  );
}

async function verifyToken(token, accountId) {
  if (!token) return { ok: true };
  const now = new Date();
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  let response;
  try {
    response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query($accountTag: string!, $since: Time!, $until: Time!) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              workersInvocationsAdaptive(
                limit: 1
                filter: { datetime_geq: $since, datetime_leq: $until }
              ) { sum { requests } }
            }
          }
        }`,
        variables: { accountTag: accountId, since, until: now.toISOString() },
      }),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (response.status === 403 || response.status === 401) {
    return { ok: false, error: `HTTP ${response.status} — token rejected` };
  }
  const payload = await response.json().catch(() => null);
  if (payload?.errors?.length) {
    return {
      ok: false,
      error: payload.errors.map((e) => e.message).join("; "),
    };
  }
  return { ok: true };
}

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolvePromise) => {
    rl.question(question, (answer) => {
      rl.close();
      resolvePromise(answer.trim());
    });
  });
}

async function promptHidden(question) {
  if (!process.stdin.isTTY) return (await prompt(question)) ?? "";
  process.stdout.write(question);
  return new Promise((resolvePromise) => {
    const chars = [];
    const raw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = (chunk) => {
      const text = chunk.toString("utf8");
      if (text === "\r" || text === "\n") {
        process.stdin.setRawMode(raw);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolvePromise(chars.join("").trim());
      } else if (text === "\u0003") {
        process.stdout.write("\n");
        process.exit(130);
      } else if (text === "\u007f" || text === "\b") {
        chars.pop();
      } else {
        chars.push(...text);
      }
    };
    process.stdin.on("data", onData);
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "setup:usage failed.",
    );
    process.exit(1);
  });
}
