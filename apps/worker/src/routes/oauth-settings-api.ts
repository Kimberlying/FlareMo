import {
  canManageInstanceIntegrations,
  ForbiddenError,
  readIntegrationConfig,
  writeIntegrationConfig,
} from "@flaremo/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { HonoBindings } from "../context";
import { getBrowserRequestContext } from "../context";
import { jsonError } from "../http";
import {
  canEncryptIntegrationCredentials,
  integrationEncryptionSecret,
  maskSecret,
  openIntegrationCredentials,
  sealIntegrationCredentials,
} from "../integrations/secret-box";

/**
 * Owner-only admin settings for social sign-in providers (Google, GitHub).
 * Client IDs are non-secret identifiers; client secrets are write-only with
 * masked previews, sealed in the integration envelope like the email config.
 */
export const oauthSettingsApi = new Hono<HonoBindings>();
oauthSettingsApi.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  try {
    const { user } = await getBrowserRequestContext(c);
    if (!canManageInstanceIntegrations(user))
      throw new ForbiddenError("Owner access is required.");
    return await next();
  } catch (error) {
    return jsonError(c, error);
  }
});
oauthSettingsApi.use("*", bodyLimit({ maxSize: 8192 }));

type ProviderPair = { clientId: string; clientSecret: string };

const providerSchema = z
  .object({
    clientId: z.string().trim().max(256).default(""),
    clientSecret: z.string().trim().max(1024).default(""),
  })
  .strict();

const credentialsSchema = z
  .object({
    google: providerSchema.default({ clientId: "", clientSecret: "" }),
    github: providerSchema.default({ clientId: "", clientSecret: "" }),
  })
  .strict();
type OauthCredentials = z.infer<typeof credentialsSchema>;

function parseStored(value: unknown): OauthCredentials {
  return credentialsSchema.parse(value);
}

const inputSchema = z
  .object({
    revision: z.string().nullable(),
    credentials: credentialsSchema,
  })
  .strict();

// A provider is active when both halves are present after the merge (empty
// strings fall back to the previously stored values, mirroring the voice
// settings' "keep old secret" behavior).
function activeProviders(value: OauthCredentials) {
  const active: Record<"google" | "github", ProviderPair | null> = {
    google: null,
    github: null,
  };
  for (const key of ["google", "github"] as const) {
    const pair = value[key];
    if (pair.clientId && pair.clientSecret) active[key] = pair;
  }
  return active;
}

oauthSettingsApi.get("/", async (c) => {
  try {
    const { db } = await getBrowserRequestContext(c);
    const env = c.env;
    const row = await readIntegrationConfig(db, "oauth");
    let credentials: OauthCredentials | null = null;
    let unreadable = false;
    if (row?.ciphertext) {
      try {
        credentials = await openIntegrationCredentials(
          "oauth",
          integrationEncryptionSecret(env),
          row.ciphertext,
          parseStored,
        );
      } catch {
        unreadable = true;
      }
    }
    const envHas = (id?: string, secret?: string) =>
      Boolean(id?.trim() && secret?.trim());
    const source =
      envHas(
        env.FLAREMO_OAUTH_GOOGLE_CLIENT_ID,
        env.FLAREMO_OAUTH_GOOGLE_CLIENT_SECRET,
      ) ||
      envHas(
        env.FLAREMO_OAUTH_GITHUB_CLIENT_ID,
        env.FLAREMO_OAUTH_GITHUB_CLIENT_SECRET,
      )
        ? "environment"
        : credentials
          ? "database"
          : "none";
    const active = activeProviders(credentials ?? credentialsSchema.parse({}));
    return c.json(
      {
        revision: row?.revision ?? null,
        unreadable,
        previews: credentials
          ? {
              google: {
                clientId: credentials.google.clientId,
                clientSecret: maskSecret(credentials.google.clientSecret),
                active: Boolean(active.google),
              },
              github: {
                clientId: credentials.github.clientId,
                clientSecret: maskSecret(credentials.github.clientSecret),
                active: Boolean(active.github),
              },
            }
          : null,
        source,
        encrypted: Boolean(row?.ciphertext?.startsWith('{"v":1')),
        canEncrypt: canEncryptIntegrationCredentials(
          integrationEncryptionSecret(env),
        ),
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (error) {
    return jsonError(c, error);
  }
});

oauthSettingsApi.put("/", async (c) => {
  try {
    const parsed = inputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: { message: "Invalid configuration" } }, 400);
    const { db } = await getBrowserRequestContext(c);
    const env = c.env;
    const row = await readIntegrationConfig(db, "oauth");
    if ((row?.revision ?? null) !== parsed.data.revision)
      return c.json(
        { error: { message: "Configuration changed. Reload before saving." } },
        409,
      );
    const value = parsed.data.credentials;
    if (row?.ciphertext) {
      try {
        const old = await openIntegrationCredentials(
          "oauth",
          integrationEncryptionSecret(env),
          row.ciphertext,
          parseStored,
        );
        if (value.google.clientId === old.google.clientId) {
          value.google.clientSecret ||= old.google.clientSecret;
        }
        if (value.github.clientId === old.github.clientId) {
          value.github.clientSecret ||= old.github.clientSecret;
        }
      } catch {
        return c.json(
          {
            error: {
              message:
                "Stored credentials unavailable. Delete them before replacing.",
            },
          },
          409,
        );
      }
    }
    const active = activeProviders(value);
    if (!active.google && !active.github) {
      return c.json(
        {
          error: {
            message:
              "At least one provider needs both a client ID and a client secret.",
          },
        },
        400,
      );
    }
    // Store only active providers; a half-filled pair is dropped so a saved
    // config can never be partially applied at sign-in time.
    const ciphertext = await sealIntegrationCredentials(
      "oauth",
      integrationEncryptionSecret(env),
      {
        google: active.google ?? undefined,
        github: active.github ?? undefined,
      },
    );
    if (
      !(await writeIntegrationConfig(db, "oauth", parsed.data.revision, {
        enabled: true,
        ciphertext,
      }))
    )
      return c.json({ error: { message: "Configuration changed" } }, 409);
    return c.json({ ok: true }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonError(c, error);
  }
});

oauthSettingsApi.delete("/", async (c) => {
  try {
    const input = z
      .object({ revision: z.string().nullable() })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: { message: "Invalid request" } }, 400);
    const { db } = await getBrowserRequestContext(c);
    if (
      !(await writeIntegrationConfig(db, "oauth", input.data.revision, {
        enabled: false,
        ciphertext: null,
      }))
    )
      return c.json({ error: { message: "Configuration changed" } }, 409);
    return c.json({ ok: true });
  } catch (error) {
    return jsonError(c, error);
  }
});
