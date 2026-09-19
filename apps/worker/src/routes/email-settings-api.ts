import {
  canManageInstanceIntegrations,
  ForbiddenError,
  readIntegrationConfig,
  writeIntegrationConfig,
} from "@flaremo/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { getBrowserRequestContext, type HonoBindings } from "../context";
import { resolveEmailSendConfig, sendTestEmail } from "../email";
import { jsonError } from "../http";
import {
  canEncryptIntegrationCredentials,
  integrationEncryptionSecret,
  maskSecret,
  openIntegrationCredentials,
  sealIntegrationCredentials,
} from "../integrations/secret-box";
import { rateLimitGuard } from "../rate-limit";

/**
 * Owner-only admin settings for transactional email (Resend). Secrets are
 * write-only: the API returns masked previews, full values never leave the
 * Worker, and saved payloads are sealed with the integration envelope
 * (plaintext JSON without an encryption key, AES-GCM with one).
 */
export const emailSettingsApi = new Hono<HonoBindings>();
emailSettingsApi.use("*", async (c, next) => {
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
emailSettingsApi.use("*", bodyLimit({ maxSize: 8192 }));

const credentialsSchema = z
  .object({
    // The stored payload tags its provider for forward compatibility; the
    // admin UI only edits Resend credentials today.
    provider: z.literal("resend").optional(),
    apiKey: z.string().trim().max(1024).default(""),
    from: z.string().trim().min(3).max(320),
    fromName: z.string().trim().max(120).default(""),
  })
  .strict();
type EmailCredentials = z.infer<typeof credentialsSchema>;

function parseStored(value: unknown): EmailCredentials {
  return credentialsSchema.parse(value);
}

const inputSchema = z
  .object({
    revision: z.string().nullable(),
    enabled: z.boolean(),
    credentials: credentialsSchema,
  })
  .strict();

emailSettingsApi.get("/", async (c) => {
  try {
    const { db } = await getBrowserRequestContext(c);
    const env = c.env;
    const row = await readIntegrationConfig(db, "email");
    let credentials: EmailCredentials | null = null;
    let unreadable = false;
    if (row?.ciphertext) {
      try {
        credentials = await openIntegrationCredentials(
          "email",
          integrationEncryptionSecret(env),
          row.ciphertext,
          parseStored,
        );
      } catch {
        unreadable = true;
      }
    }
    const effective = await resolveEmailSendConfig(env, db);
    const source =
      effective.provider === "none"
        ? "none"
        : row?.ciphertext && effective.provider === "resend"
          ? "database"
          : "environment";
    return c.json(
      {
        revision: row?.revision ?? null,
        enabled: Boolean(row?.enabled && credentials),
        source,
        configured: effective.provider !== "none",
        provider: effective.provider,
        from: effective.from,
        unreadable,
        previews: credentials
          ? {
              apiKey: maskSecret(credentials.apiKey),
              from: credentials.from,
              fromName: credentials.fromName,
            }
          : null,
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

emailSettingsApi.put("/", async (c) => {
  try {
    const parsed = inputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: { message: "Invalid configuration" } }, 400);
    const { db } = await getBrowserRequestContext(c);
    const env = c.env;
    const row = await readIntegrationConfig(db, "email");
    if ((row?.revision ?? null) !== parsed.data.revision)
      return c.json(
        { error: { message: "Configuration changed. Reload before saving." } },
        409,
      );
    const value = parsed.data.credentials;
    if (!value.from) {
      return c.json({ error: { message: "Sender address required" } }, 400);
    }
    if (row?.ciphertext) {
      try {
        const old = await openIntegrationCredentials(
          "email",
          integrationEncryptionSecret(env),
          row.ciphertext,
          parseStored,
        );
        value.apiKey ||= old.apiKey;
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
    if (!value.apiKey) {
      return c.json({ error: { message: "Resend API key is required." } }, 400);
    }
    const ciphertext = await sealIntegrationCredentials(
      "email",
      integrationEncryptionSecret(env),
      { provider: "resend", ...value },
    );
    if (
      !(await writeIntegrationConfig(db, "email", parsed.data.revision, {
        enabled: parsed.data.enabled,
        ciphertext,
      }))
    )
      return c.json({ error: { message: "Configuration changed" } }, 409);
    return c.json({ ok: true }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonError(c, error);
  }
});

emailSettingsApi.delete("/", async (c) => {
  try {
    const input = z
      .object({ revision: z.string().nullable() })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: { message: "Invalid request" } }, 400);
    const { db } = await getBrowserRequestContext(c);
    if (
      !(await writeIntegrationConfig(db, "email", input.data.revision, {
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

// Sends a real test email to the owner's own address so the owner can verify
// the sender domain, key and delivery without touching any user data.
emailSettingsApi.post("/test", async (c) => {
  try {
    const { user, db } = await getBrowserRequestContext(c);
    const env = c.env;
    const limited = await rateLimitGuard(c, "email", user.id);
    if (limited) return limited;
    const config = await resolveEmailSendConfig(env, db);
    if (config.provider === "none" || !config.from) {
      return c.json(
        { error: { message: "Email sending is not configured." } },
        503,
      );
    }
    const ok = await sendTestEmail(env, db, config, user.email);
    if (!ok) {
      return c.json(
        {
          error: {
            message:
              "Test email could not be sent. Check the key, sender address and domain.",
          },
        },
        502,
      );
    }
    return c.json({ ok: true }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return jsonError(c, error);
  }
});
