import type { FlareMoDb } from "@flaremo/db";
import { type IntegrationRow, readIntegrationConfig } from "@flaremo/domain";
import { z } from "zod";
import type { FlareMoEnv } from "../env";
import {
  integrationEncryptionSecret,
  openIntegrationCredentials,
} from "./secret-box";

/**
 * Owner-configured integration settings resolution. Environment variables
 * win when they fully configure an integration; the encrypted D1 row is the
 * fallback (and the only path with an admin UI). Resolved values are cached
 * per isolate for a short TTL so hot auth-handler requests do not hit D1
 * every time while owner edits still propagate within seconds.
 */

const EMAIL_PAYLOAD = z
  .object({
    provider: z.literal("resend"),
    apiKey: z.string().min(1).max(1024),
    from: z.string().min(3).max(320),
    fromName: z.string().max(120).default(""),
  })
  .strict();
export type EmailIntegrationCredentials = z.infer<typeof EMAIL_PAYLOAD>;

export type ResolvedEmailIntegration = {
  source: "environment" | "database" | "none";
  provider: "none" | "cloudflare" | "resend";
  from: string | null;
  resendApiKey: string | null;
  revision: string | null;
  unreadable: boolean;
};

export function envEmailConfig(env: FlareMoEnv): {
  provider: "none" | "cloudflare" | "resend";
  from: string | null;
  apiKey: string | null;
} {
  const provider = env.FLAREMO_EMAIL_PROVIDER?.trim();
  const from = env.FLAREMO_EMAIL_FROM?.trim() || null;
  if (provider === "cloudflare") {
    return { provider, from, apiKey: null };
  }
  if (provider === "resend") {
    const apiKey = env.RESEND_API_KEY?.trim() || null;
    return apiKey
      ? { provider, from, apiKey }
      : { provider: "none", from: null, apiKey: null };
  }
  return { provider: "none", from: null, apiKey: null };
}

function parseEmailPayload(value: unknown): EmailIntegrationCredentials {
  return EMAIL_PAYLOAD.parse(value);
}

export async function openEmailIntegration(
  env: FlareMoEnv,
  row: IntegrationRow | null,
): Promise<{
  credentials: EmailIntegrationCredentials | null;
  unreadable: boolean;
}> {
  if (!row?.ciphertext || !row.enabled) {
    return { credentials: null, unreadable: false };
  }
  try {
    return {
      credentials: await openIntegrationCredentials(
        "email",
        integrationEncryptionSecret(env),
        row.ciphertext,
        parseEmailPayload,
      ),
      unreadable: false,
    };
  } catch {
    return { credentials: null, unreadable: true };
  }
}

/**
 * Effective transactional email configuration. Env wins when it configures a
 * working provider; the owner's saved D1 settings (Resend) apply otherwise.
 */
export async function resolveEmailIntegration(
  env: FlareMoEnv,
  db: FlareMoDb,
): Promise<ResolvedEmailIntegration> {
  const fromEnv = envEmailConfig(env);
  if (fromEnv.provider !== "none") {
    return {
      source: "environment",
      provider: fromEnv.provider,
      from: fromEnv.from,
      resendApiKey: fromEnv.apiKey,
      revision: null,
      unreadable: false,
    };
  }
  let row: IntegrationRow | null = null;
  try {
    row = await readIntegrationConfig(db, "email");
  } catch {
    // A missing/unavailable database binding must not break the send path;
    // treat the stored config as unset.
  }
  const { credentials, unreadable } = await openEmailIntegration(env, row);
  if (credentials) {
    return {
      source: "database",
      provider: "resend",
      from: credentials.from,
      resendApiKey: credentials.apiKey,
      revision: row?.revision ?? null,
      unreadable: false,
    };
  }
  return {
    source: "none",
    provider: "none",
    from: null,
    resendApiKey: null,
    revision: row?.revision ?? null,
    unreadable,
  };
}

const OAUTH_PAYLOAD = z
  .object({
    google: z
      .object({
        clientId: z.string().min(1).max(256),
        clientSecret: z.string().min(1).max(1024),
      })
      .optional(),
    github: z
      .object({
        clientId: z.string().min(1).max(256),
        clientSecret: z.string().min(1).max(1024),
      })
      .optional(),
  })
  .strict();
export type OauthIntegrationCredentials = z.infer<typeof OAUTH_PAYLOAD>;

export type ResolvedOauthIntegration = {
  google: { clientId: string; clientSecret: string } | null;
  github: { clientId: string; clientSecret: string } | null;
  revision: string | null;
};

function parseOauthPayload(value: unknown): OauthIntegrationCredentials {
  return OAUTH_PAYLOAD.parse(value);
}

function envOauthConfig(env: FlareMoEnv): {
  google: { clientId: string; clientSecret: string } | null;
  github: { clientId: string; clientSecret: string } | null;
} {
  const pick = (id?: string, secret?: string) => {
    const clientId = id?.trim();
    const clientSecret = secret?.trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  };
  return {
    google: pick(
      env.FLAREMO_OAUTH_GOOGLE_CLIENT_ID,
      env.FLAREMO_OAUTH_GOOGLE_CLIENT_SECRET,
    ),
    github: pick(
      env.FLAREMO_OAUTH_GITHUB_CLIENT_ID,
      env.FLAREMO_OAUTH_GITHUB_CLIENT_SECRET,
    ),
  };
}

async function openOauthIntegration(
  env: FlareMoEnv,
  row: IntegrationRow | null,
): Promise<OauthIntegrationCredentials | null> {
  if (!row?.ciphertext || !row.enabled) return null;
  try {
    return await openIntegrationCredentials(
      "oauth",
      integrationEncryptionSecret(env),
      row.ciphertext,
      parseOauthPayload,
    );
  } catch {
    return null;
  }
}

/**
 * Effective social-provider configuration. Env wins per provider; the
 * owner's saved D1 settings fill whichever providers the env leaves unset.
 */
export async function resolveOauthIntegration(
  env: FlareMoEnv,
  db: FlareMoDb,
): Promise<ResolvedOauthIntegration> {
  const fromEnv = envOauthConfig(env);
  let google = fromEnv.google;
  let github = fromEnv.github;
  let revision: string | null = null;
  if (!google || !github) {
    try {
      const row = await readIntegrationConfig(db, "oauth");
      revision = row?.revision ?? null;
      const credentials = await openOauthIntegration(env, row);
      google ??= credentials?.google ?? null;
      github ??= credentials?.github ?? null;
    } catch {
      // Unavailable database binding: fall back to env-only providers.
    }
  }
  return { google, github, revision };
}

// Hot-path cache for the OAuth-aware auth handler: one revision-check read
// per TTL window per isolate instead of per request.
const OAUTH_CACHE_TTL_MS = 30_000;
const oauthCache = new WeakMap<
  FlareMoEnv,
  {
    checkedAt: number;
    config: ResolvedOauthIntegration;
  }
>();

export async function resolveOauthIntegrationCached(
  env: FlareMoEnv,
  db: FlareMoDb,
): Promise<ResolvedOauthIntegration> {
  const cached = oauthCache.get(env);
  if (cached && Date.now() - cached.checkedAt < OAUTH_CACHE_TTL_MS) {
    return cached.config;
  }
  const config = await resolveOauthIntegration(env, db);
  oauthCache.set(env, { checkedAt: Date.now(), config });
  return config;
}
