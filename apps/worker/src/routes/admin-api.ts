import type { FlareMoDb } from "@flaremo/db";
import {
  assertMemberQuota,
  BRANDING_ACCENT_HEX_PATTERN,
  BRANDING_ACCENT_PRESETS,
  BRANDING_FAVICON_CONTENT_TYPES,
  BRANDING_MARK_CONTENT_TYPES,
  BRANDING_MARK_MAX_BYTES,
  BRANDING_PRODUCT_NAME_MAX_CHARS,
  type BrandingMark,
  beginFlaremoMemberRemoval,
  brandingFaviconR2Key,
  brandingMarkR2Key,
  ConflictError,
  CUSTOM_BRANDING_ACCENT,
  clearBrandingFavicon,
  clearBrandingMark,
  createFlaremoMemberWithLink,
  createMemberRemovalJob,
  DEFAULT_FLAREMO_PRODUCT_NAME,
  deriveUniqueUsername,
  ForbiddenError,
  failMemberRemovalJob,
  finalizeFlaremoMemberRemoval,
  getAuthUserById,
  getAuthUserIdByFlaremoUserId,
  getBranding,
  getFlaremoUserByAuthUserId,
  getFlaremoUserById,
  getMemberRemovalJob,
  getMembershipState,
  getPluginSettings,
  getUserRegistrationAllowed,
  grantTeamReader,
  isInstanceOwner,
  isTeamAdmin,
  isTeamOwner,
  isValidBrandingContentType,
  isValidBrandingFaviconContentType,
  listFlaremoUsers,
  listMemberRemovalJobs,
  NotFoundError,
  PLUGIN_LIST_LIMIT,
  type ResolvedBranding,
  rebuildEmbeddingIndexes,
  revokeTeamReader,
  setBrandingAccent,
  setBrandingProductName,
  setPluginSettings,
  setUserRegistrationAllowed,
  updateMemberRemovalJob,
  updateTeamMemberRole,
  upsertBrandingFavicon,
  upsertBrandingMark,
  ValidationError,
} from "@flaremo/domain";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { cleanupFlaremoArtifacts } from "../artifact-cleanup";
import { createFlareMoAuth } from "../auth";
import {
  getBrowserRequestContext,
  getFlareMoRuntime,
  getRequestContext,
  type HonoBindings,
} from "../context";
import { createEmbeddingProvider, createVectorIndex } from "../embedding";
import { jsonError } from "../http";

export const adminApi = new Hono<HonoBindings>();

const updateSettingsSchema = z.object({
  registration_open: z.boolean(),
});

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(320),
});

const updateUserRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

/**
 * Machine provisioning enters the admin surface through the same credential
 * resolver the rest of the API uses: a `Bearer memos_pat_*` token resolves to
 * its owner (with the team role), while browser requests keep the strict
 * session-only path. The PAT therefore carries exactly its owner's powers —
 * no more — and the per-endpoint role checks below stay in charge.
 */
async function adminCredentialContext(
  c: Parameters<typeof getBrowserRequestContext>[0],
) {
  return c.req.raw.headers.has("authorization")
    ? await getRequestContext(c)
    : await getBrowserRequestContext(c);
}

async function teamAdminContext(
  c: Parameters<typeof getBrowserRequestContext>[0],
) {
  const context = await adminCredentialContext(c);
  if (!isTeamAdmin(context.user)) {
    throw new ForbiddenError("Team administrator access is required.");
  }
  return context;
}

async function ownerContext(c: Parameters<typeof getBrowserRequestContext>[0]) {
  const context = await adminCredentialContext(c);
  if (!isInstanceOwner(context.user)) {
    throw new ForbiddenError("Owner access is required.");
  }
  return context;
}

/**
 * Resolve a member's team membership (role + reader expiry) through their
 * Better Auth identity. Removed members have no membership row and surface
 * with null.
 */
async function teamMembershipInfo(
  db: FlareMoDb,
  flaremoUserId: string,
): Promise<{
  role: "owner" | "admin" | "member" | "reader";
  expiresAt: Date | null;
} | null> {
  const authUserId = await getAuthUserIdByFlaremoUserId(db, flaremoUserId);
  if (!authUserId) return null;
  const state = await getMembershipState(db, authUserId);
  if (!state) return null;
  return { role: state.role, expiresAt: state.expiresAt };
}

/** Serialize reader expiry as an ISO string for the admin user DTO. */
function readerExpiresAt(expiresAt: Date | null): string | null {
  return expiresAt ? expiresAt.toISOString() : null;
}

// Kept as a compatibility endpoint for existing deployments and clients. The
// team-management UI does not expose this switch; adding members is the normal
// team-mode path and registration remains closed by default.
adminApi.get("/settings", async (c) => {
  try {
    const { db } = await ownerContext(c);
    return c.json({
      registration_open: await getUserRegistrationAllowed(db),
    });
  } catch (error) {
    return jsonError(c, error);
  }
});

adminApi.patch(
  "/settings",
  zValidator("json", updateSettingsSchema),
  async (c) => {
    try {
      const { db } = await ownerContext(c);
      await setUserRegistrationAllowed(
        db,
        c.req.valid("json").registration_open,
      );
      return c.json({
        registration_open: await getUserRegistrationAllowed(db),
      });
    } catch (error) {
      return jsonError(c, error);
    }
  },
);

const updateBrandingSchema = z.object({
  product_name: z
    .string()
    .trim()
    .max(BRANDING_PRODUCT_NAME_MAX_CHARS)
    .nullable()
    .optional(),
  accent: z
    .enum([...BRANDING_ACCENT_PRESETS, CUSTOM_BRANDING_ACCENT])
    .nullable()
    .optional(),
  // Seed hex for the custom accent; validated + stored lowercased in domain.
  accent_hex: z
    .string()
    .trim()
    .regex(BRANDING_ACCENT_HEX_PATTERN)
    .nullable()
    .optional(),
});

adminApi.get("/branding", async (c) => {
  try {
    const { db } = await ownerContext(c);
    const branding = await getBranding(db);
    const markUrl = (variant: "light" | "dark", mark: BrandingMark | null) =>
      mark
        ? `/api/app/branding/marks/${variant}?v=${encodeURIComponent(mark.updated_at)}`
        : null;
    return c.json({
      product_name:
        branding.product === DEFAULT_FLAREMO_PRODUCT_NAME
          ? null
          : branding.product,
      accent: branding.accent,
      accent_hex: branding.accentHex,
      mark_light_url: markUrl("light", branding.marks.light),
      mark_dark_url: markUrl("dark", branding.marks.dark),
      favicon_url: branding.favicon
        ? `/api/app/branding/favicon?v=${encodeURIComponent(branding.favicon.updated_at)}`
        : null,
      favicon_content_type: branding.favicon?.content_type ?? null,
    });
  } catch (error) {
    return jsonError(c, error);
  }
});

adminApi.put(
  "/branding",
  zValidator("json", updateBrandingSchema),
  async (c) => {
    try {
      const { db } = await ownerContext(c);
      const patch = c.req.valid("json");
      let branding: ResolvedBranding | null = null;
      if (patch.product_name !== undefined) {
        branding = await setBrandingProductName(db, patch.product_name);
      }
      if (patch.accent !== undefined) {
        branding = await setBrandingAccent(
          db,
          patch.accent,
          patch.accent_hex !== undefined ? patch.accent_hex : undefined,
        );
      } else if (patch.accent_hex !== undefined) {
        // Hex-only update retargets the existing custom seed's color.
        const current = await getBranding(db);
        if (current.accent === CUSTOM_BRANDING_ACCENT) {
          branding = await setBrandingAccent(db, "custom", patch.accent_hex);
        } else {
          branding = current;
        }
      }
      branding ??= await getBranding(db);
      return c.json({
        product: branding.product,
        accent: branding.accent,
        accent_hex: branding.accentHex,
      });
    } catch (error) {
      return jsonError(c, error);
    }
  },
);

// Binary logo upload: raw body + explicit content type (validated against
// BRANDING_MARK_CONTENT_TYPES, size-capped at BRANDING_MARK_MAX_BYTES).
adminApi.put("/branding/marks/:variant", async (c) => {
  try {
    const { db } = await ownerContext(c);
    const variant = z.enum(["light", "dark"]).safeParse(c.req.param("variant"));
    if (!variant.success) {
      throw new ValidationError("Variant must be light or dark.");
    }
    const contentType = c.req.header("content-type") ?? null;
    if (!isValidBrandingContentType(contentType)) {
      throw new ValidationError(
        `Logo must be one of: ${BRANDING_MARK_CONTENT_TYPES.join(", ")}.`,
      );
    }
    const bytes = await c.req.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > BRANDING_MARK_MAX_BYTES) {
      throw new ValidationError(
        `Logo must be between 1 and ${BRANDING_MARK_MAX_BYTES} bytes.`,
      );
    }
    const key = brandingMarkR2Key(variant.data);
    await c.env.ATTACHMENTS.put(key, bytes, {
      httpMetadata: { contentType },
    });
    await upsertBrandingMark(db, variant.data, contentType);
    return c.json({ saved: true, variant: variant.data });
  } catch (error) {
    return jsonError(c, error);
  }
});

adminApi.delete("/branding/marks/:variant", async (c) => {
  try {
    const { db } = await ownerContext(c);
    const variant = z.enum(["light", "dark"]).safeParse(c.req.param("variant"));
    if (!variant.success) {
      throw new ValidationError("Variant must be light or dark.");
    }
    const staleKey = await clearBrandingMark(db, variant.data);
    if (staleKey) {
      await c.env.ATTACHMENTS.delete(staleKey);
    }
    return c.json({ removed: true, variant: variant.data });
  } catch (error) {
    return jsonError(c, error);
  }
});

// Favicon upload: same raw-body contract as the logo marks, with .ico added
// to the accepted content types (BRANDING_FAVICON_CONTENT_TYPES).
adminApi.put("/branding/favicon", async (c) => {
  try {
    const { db } = await ownerContext(c);
    const contentType = c.req.header("content-type") ?? null;
    if (!isValidBrandingFaviconContentType(contentType)) {
      throw new ValidationError(
        `Favicon must be one of: ${BRANDING_FAVICON_CONTENT_TYPES.join(", ")}.`,
      );
    }
    const bytes = await c.req.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > BRANDING_MARK_MAX_BYTES) {
      throw new ValidationError(
        `Favicon must be between 1 and ${BRANDING_MARK_MAX_BYTES} bytes.`,
      );
    }
    await c.env.ATTACHMENTS.put(brandingFaviconR2Key(), bytes, {
      httpMetadata: { contentType },
    });
    await upsertBrandingFavicon(db, contentType);
    return c.json({ saved: true });
  } catch (error) {
    return jsonError(c, error);
  }
});

adminApi.delete("/branding/favicon", async (c) => {
  try {
    const { db } = await ownerContext(c);
    const staleKey = await clearBrandingFavicon(db);
    if (staleKey) {
      await c.env.ATTACHMENTS.delete(staleKey);
    }
    return c.json({ removed: true });
  } catch (error) {
    return jsonError(c, error);
  }
});

const pluginIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const pluginIdListSchema = z.array(pluginIdSchema).max(PLUGIN_LIST_LIMIT);
const optionKeySchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/);
const cardOptionsSchema = z.record(
  pluginIdSchema,
  z.record(optionKeySchema, z.union([z.string(), z.number(), z.boolean()])),
);
const updatePluginsSchema = z.object({
  enabledPlugins: pluginIdListSchema.optional(),
  disabledPlugins: pluginIdListSchema.optional(),
  cards: z
    .object({
      order: pluginIdListSchema.optional(),
      hidden: pluginIdListSchema.optional(),
      default: pluginIdSchema.nullable().optional(),
      options: cardOptionsSchema.optional(),
    })
    .optional(),
});

adminApi.get("/plugins", async (c) => {
  try {
    const { db } = await ownerContext(c);
    return c.json(await getPluginSettings(db));
  } catch (error) {
    return jsonError(c, error);
  }
});

adminApi.put("/plugins", zValidator("json", updatePluginsSchema), async (c) => {
  try {
    const { db } = await ownerContext(c);
    return c.json(await setPluginSettings(db, c.req.valid("json")));
  } catch (error) {
    return jsonError(c, error);
  }
});

adminApi.get("/users", async (c) => {
  try {
    const { db } = await teamAdminContext(c);
    const members = await listFlaremoUsers(db);
    const rows = await Promise.all(
      members.map(async (member) => {
        const authUserId = await getAuthUserIdByFlaremoUserId(db, member.id);
        const authUser = authUserId
          ? await getAuthUserById(db, authUserId)
          : null;
        const membership = authUserId
          ? await teamMembershipInfo(db, member.id)
          : null;
        return {
          id: member.id,
          email: authUser?.email ?? member.email,
          name: member.name,
          username: authUser?.username ?? member.id.replace(/^users\//, ""),
          role: membership?.role ?? null,
          reader_expires_at: membership
            ? readerExpiresAt(membership.expiresAt)
            : null,
          status: member.status,
          created_at: member.createdAt,
        };
      }),
    );
    return c.json({ users: rows });
  } catch (error) {
    return jsonError(c, error);
  }
});

/**
 * Create a Better Auth identity, the domain user, the link, and the default
 * team membership in one shot. Administrators never choose or receive a
 * member password: the one-time reset token doubles as the activation
 * credential. Shared by the manual add-member endpoint and the machine
 * provisioning endpoint so both paths stay identical.
 */
async function createMemberAccount(
  c: Parameters<typeof getBrowserRequestContext>[0],
  context: Awaited<ReturnType<typeof teamAdminContext>>,
  input: { email: string; name: string },
): Promise<{
  member: Awaited<ReturnType<typeof createFlaremoMemberWithLink>>;
  authUserId: string;
  username: string;
  activationToken: string;
}> {
  const email = input.email;
  const username = await deriveUniqueUsername(context.db, email);
  // Check before Better Auth creates an identity so quota failures cannot
  // leave an orphaned login account.
  await assertMemberQuota(context.db, context.limits);
  const auth = createFlareMoAuth(c.env, context.db, {
    allowBootstrapSignUp: true,
  });
  const result = await auth.api.signUpEmail({
    body: {
      email,
      name: input.name,
      password: `${crypto.randomUUID()}-${crypto.randomUUID()}Aa1!`,
      username,
      displayUsername: input.name,
    },
  });
  const member = await createFlaremoMemberWithLink(
    context.db,
    {
      authUserId: result.user.id,
      email,
      name: input.name,
    },
    context.limits,
  );
  const activationToken = await auth.createPasswordResetToken(result.user.id);
  return { member, authUserId: result.user.id, username, activationToken };
}

adminApi.post("/users", zValidator("json", createUserSchema), async (c) => {
  try {
    const context = await teamAdminContext(c);
    const input = c.req.valid("json");
    const { member, username, activationToken } = await createMemberAccount(
      c,
      context,
      {
        email: input.email,
        name: input.name,
      },
    );
    return c.json(
      {
        id: member.id,
        email: input.email,
        name: member.name,
        username,
        role: "member" as const,
        status: member.status,
        created_at: member.createdAt,
        activation_path: `/reset?token=${encodeURIComponent(activationToken)}`,
        activation_expires_in_seconds: 60 * 60,
      },
      201,
    );
  } catch (error) {
    return jsonError(c, error);
  }
});

const provisionReaderSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().min(1).max(80).optional(),
  // Absolute expiry timestamp (ISO-8601); null = a reader seat without an
  // expiry. Renewal arithmetic stays with the caller.
  expires_at: z.string().min(1).nullable(),
});

/**
 * Idempotent machine provisioning: grant (or renew) the reader seat by
 * email. Unknown emails get a fresh account with an activation link, so one
 * external call — a payment webhook, a script — opens a seat end to end.
 * Account creation stays strictly additive; anything that would demote an
 * administrator or the owner is rejected like the per-user endpoint.
 */
adminApi.put(
  "/team/reader",
  zValidator("json", provisionReaderSchema),
  async (c) => {
    try {
      const context = await teamAdminContext(c);
      const input = c.req.valid("json");
      const email = input.email.toLowerCase();
      let expiresAt: Date | null = null;
      if (input.expires_at) {
        expiresAt = new Date(input.expires_at);
        if (Number.isNaN(expiresAt.getTime())) {
          throw new ValidationError("expires_at must be a valid date.");
        }
      }

      const { auth } = getFlareMoRuntime(c.env);
      const existingAuthUser = await auth.findAuthUserByEmail(email);
      const memberRow = existingAuthUser
        ? await getFlaremoUserByAuthUserId(context.db, existingAuthUser.id)
        : null;

      if (existingAuthUser && !memberRow) {
        // The auth identity exists without a domain user (or was removed):
        // machine provisioning never resurrects removed accounts.
        throw new ConflictError(
          "No active FlareMo account matches this email.",
        );
      }
      if (memberRow && memberRow.status !== "active") {
        throw new ConflictError(
          "No active FlareMo account matches this email.",
        );
      }

      let created = false;
      let memberId: string;
      let memberName: string;
      let username: string;
      let activationToken: string | undefined;
      let memberCreatedAt: string;
      let memberStatus: string;

      if (!memberRow) {
        created = true;
        const account = await createMemberAccount(c, context, {
          email,
          name: input.name ?? email.split("@")[0] ?? email,
        });
        memberId = account.member.id;
        memberName = account.member.name;
        username = account.username;
        activationToken = account.activationToken;
        memberCreatedAt = account.member.createdAt;
        memberStatus = account.member.status;
        await grantTeamReader(context.db, {
          authUserId: account.authUserId,
          expiresAt,
        });
      } else {
        const membership = await teamMembershipInfo(context.db, memberRow.id);
        if (membership?.role === "owner" || membership?.role === "admin") {
          throw new ForbiddenError(
            "Administrators and the owner cannot become readers.",
          );
        }
        const authUserId = await getAuthUserIdByFlaremoUserId(
          context.db,
          memberRow.id,
        );
        if (!authUserId) {
          throw new NotFoundError("Active member not found");
        }
        username = await getAuthUserById(context.db, authUserId).then(
          (user) => user?.username ?? memberRow.id.replace(/^users\//, ""),
        );
        memberId = memberRow.id;
        memberName = memberRow.name;
        memberCreatedAt = memberRow.createdAt;
        memberStatus = memberRow.status;
        await grantTeamReader(context.db, { authUserId, expiresAt });
      }

      return c.json(
        {
          id: memberId,
          email,
          name: memberName,
          username,
          role: "reader" as const,
          reader_expires_at: readerExpiresAt(expiresAt),
          status: memberStatus,
          created_at: memberCreatedAt,
          created,
          ...(created && activationToken
            ? {
                activation_path: `/reset?token=${encodeURIComponent(activationToken)}`,
                activation_expires_in_seconds: 60 * 60,
              }
            : {}),
        },
        created ? 201 : 200,
      );
    } catch (error) {
      return jsonError(c, error);
    }
  },
);

adminApi.patch(
  "/users/:id/role",
  zValidator("json", updateUserRoleSchema),
  async (c) => {
    try {
      const context = await teamAdminContext(c);
      const id = c.req.param("id");
      const authUserId = await getAuthUserIdByFlaremoUserId(context.db, id);
      if (!authUserId) {
        throw new NotFoundError("Active member not found");
      }
      // Only the team owner elevates or demotes members — administrators
      // manage members but never change roles (peer-protection rule). The
      // owner-target guard comes first so a non-owner administrator sees the
      // same owner-immutability error the domain enforces.
      const targetRole =
        (await teamMembershipInfo(context.db, id))?.role ?? null;
      if (targetRole === "owner") {
        throw new ForbiddenError("The owner role cannot be changed.");
      }
      if (!isTeamOwner(context.user)) {
        throw new ForbiddenError("Only the team owner can change roles.");
      }
      await updateTeamMemberRole(
        context.db,
        authUserId,
        c.req.valid("json").role,
      );
      const member = await getFlaremoUserById(context.db, id);
      if (!member) {
        throw new NotFoundError("Active member not found");
      }
      const authUser = await getAuthUserById(context.db, authUserId);
      return c.json({
        id: member.id,
        email: authUser?.email ?? member.email,
        name: member.name,
        username: authUser?.username ?? member.id.replace(/^users\//, ""),
        role: c.req.valid("json").role,
        status: member.status,
        created_at: member.createdAt,
      });
    } catch (error) {
      return jsonError(c, error);
    }
  },
);

const setReaderSchema = z.object({
  // Absolute expiry timestamp (ISO-8601); null = a reader seat without an
  // expiry. Renewal arithmetic (extend from max(now, current expiry)) is the
  // admin UI's job — this endpoint stores the computed date.
  expires_at: z.string().min(1).nullable(),
});

adminApi.put(
  "/users/:id/reader",
  zValidator("json", setReaderSchema),
  async (c) => {
    try {
      const context = await teamAdminContext(c);
      const id = c.req.param("id");
      const authUserId = await getAuthUserIdByFlaremoUserId(context.db, id);
      if (!authUserId) {
        throw new NotFoundError("Active member not found");
      }
      // Peer protection: reader is a downgrade — it can be granted to plain
      // members or to users outside the team, never to administrators or the
      // owner (whose role is immutable anyway).
      const targetRole =
        (await teamMembershipInfo(context.db, id))?.role ?? null;
      if (targetRole === "owner" || targetRole === "admin") {
        throw new ForbiddenError(
          "Administrators and the owner cannot become readers.",
        );
      }
      const rawExpiresAt = c.req.valid("json").expires_at;
      let expiresAt: Date | null = null;
      if (rawExpiresAt) {
        expiresAt = new Date(rawExpiresAt);
        if (Number.isNaN(expiresAt.getTime())) {
          throw new ValidationError("expires_at must be a valid date.");
        }
      }
      await grantTeamReader(context.db, { authUserId, expiresAt });
      const member = await getFlaremoUserById(context.db, id);
      if (!member) {
        throw new NotFoundError("Active member not found");
      }
      const authUser = await getAuthUserById(context.db, authUserId);
      return c.json({
        id: member.id,
        email: authUser?.email ?? member.email,
        name: member.name,
        username: authUser?.username ?? member.id.replace(/^users\//, ""),
        role: "reader" as const,
        reader_expires_at: readerExpiresAt(expiresAt),
        status: member.status,
        created_at: member.createdAt,
      });
    } catch (error) {
      return jsonError(c, error);
    }
  },
);

adminApi.delete("/users/:id/reader", async (c) => {
  try {
    const context = await teamAdminContext(c);
    const id = c.req.param("id");
    const authUserId = await getAuthUserIdByFlaremoUserId(context.db, id);
    if (!authUserId) {
      throw new NotFoundError("Active member not found");
    }
    const membership = await teamMembershipInfo(context.db, id);
    if (!membership || membership.role !== "reader") {
      throw new NotFoundError("Reader seat not found");
    }
    await revokeTeamReader(context.db, authUserId);
    const member = await getFlaremoUserById(context.db, id);
    if (!member) {
      throw new NotFoundError("Active member not found");
    }
    const authUser = await getAuthUserById(context.db, authUserId);
    return c.json({
      id: member.id,
      email: authUser?.email ?? member.email,
      name: member.name,
      username: authUser?.username ?? member.id.replace(/^users\//, ""),
      role: null,
      reader_expires_at: null,
      status: member.status,
      created_at: member.createdAt,
    });
  } catch (error) {
    return jsonError(c, error);
  }
});

adminApi.delete("/users/:id", async (c) => {
  let jobId: string | undefined;
  try {
    const context = await teamAdminContext(c);
    const id = c.req.param("id");
    if (id === context.user.id) {
      throw new ForbiddenError("You cannot remove yourself from the team.");
    }
    if (!/^users\//.test(id)) {
      throw new NotFoundError("Member not found");
    }
    // Peer protection: only the team owner removes administrators.
    const targetRole = (await teamMembershipInfo(context.db, id))?.role ?? null;
    if (targetRole === "admin" && !isTeamOwner(context.user)) {
      throw new ForbiddenError(
        "Only the team owner can remove an administrator.",
      );
    }

    const job = await createMemberRemovalJob(context.db, id, context.user.id);
    jobId = job.id;
    // Artifact cleanup fans out to thousands of Vectorize/R2 deletes for a
    // large member — far beyond the request subrequest budget. Hand the
    // idempotent executor to the queue; only queue-less minimal deployments
    // run it inline.
    if (c.env.MEMBER_REMOVAL_QUEUE) {
      await c.env.MEMBER_REMOVAL_QUEUE.send({ jobId: job.id });
      return c.json({ ok: true, job }, 202);
    }
    await updateMemberRemovalJob(context.db, job.id, {
      status: "removing",
      phase: "revoking_access",
      attempts: (job.attempts ?? 0) + 1,
    });
    const artifacts = await beginFlaremoMemberRemoval(context.db, id);
    await updateMemberRemovalJob(context.db, job.id, {
      phase: "cleaning_artifacts",
    });
    await cleanupFlaremoArtifacts(c.env, artifacts);
    await updateMemberRemovalJob(context.db, job.id, { phase: "finalizing" });
    await finalizeFlaremoMemberRemoval(context.db, id, artifacts);
    const completed = await updateMemberRemovalJob(context.db, job.id, {
      status: "completed",
      phase: "completed",
      completedAt: new Date().toISOString(),
    });
    return c.json({ ok: true, job: completed });
  } catch (error) {
    if (jobId) {
      const context = await getBrowserRequestContext(c).catch(() => undefined);
      if (context) {
        await failMemberRemovalJob(
          context.db,
          jobId,
          "member_removal_failed",
          error instanceof Error ? error.message : "Member removal failed",
        ).catch(() => undefined);
      }
    }
    return jsonError(c, error);
  }
});

adminApi.get("/member-removal-jobs", async (c) => {
  try {
    const context = await teamAdminContext(c);
    return c.json({ jobs: await listMemberRemovalJobs(context.db) });
  } catch (error) {
    return jsonError(c, error);
  }
});

adminApi.get("/member-removal-jobs/:id", async (c) => {
  try {
    const context = await teamAdminContext(c);
    const job = await getMemberRemovalJob(context.db, c.req.param("id"));
    if (!job) throw new NotFoundError("Removal job not found");
    return c.json({ job });
  } catch (error) {
    return jsonError(c, error);
  }
});

adminApi.post("/member-removal-jobs/:id/retry", async (c) => {
  try {
    const context = await teamAdminContext(c);
    const id = c.req.param("id");
    const job = await getMemberRemovalJob(context.db, id);
    if (!job) throw new NotFoundError("Removal job not found");
    if (job.status !== "failed") {
      throw new ForbiddenError("Only failed removal jobs can be retried.");
    }
    const retried = await updateMemberRemovalJob(context.db, id, {
      status: "queued",
      phase: "retry_queued",
      attempts: (job.attempts ?? 0) + 1,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
    });
    await c.env.MEMBER_REMOVAL_QUEUE?.send({ jobId: id });
    return c.json({ job: retried }, 202);
  } catch (error) {
    return jsonError(c, error);
  }
});

// Owner-only recovery path: re-embed every memo and memory from D1 into the
// vector indexes. Used after model/dimension changes or index corruption;
// the ops runbook documents it as the outbox/repair trigger.
adminApi.post("/embeddings/rebuild", async (c) => {
  try {
    const context = await ownerContext(c);
    const provider = createEmbeddingProvider(c.env);
    const memosIndex = createVectorIndex(c.env, "memo");
    const memoriesIndex = createVectorIndex(c.env, "memory");
    if (!provider || !memosIndex || !memoriesIndex) {
      throw new ValidationError(
        "Embedding provider or vector indexes are not configured.",
      );
    }
    const result = await rebuildEmbeddingIndexes(context.db, {
      provider,
      memosIndex,
      memoriesIndex,
    });
    return c.json(result);
  } catch (error) {
    return jsonError(c, error);
  }
});

adminApi.post("/users/:id/reset-password", async (c) => {
  try {
    const context = await teamAdminContext(c);
    const id = c.req.param("id");
    const member = await getFlaremoUserById(context.db, id);
    if (member?.status !== "active") {
      throw new NotFoundError("Active member not found");
    }
    // A reset token mints a credential — apply the same takeover guard as
    // role changes and member removal: administrators cannot touch the owner
    // or another administrator; only the owner can.
    if (id === "users/owner") {
      throw new ForbiddenError(
        "The owner password cannot be reset through the admin API.",
      );
    }
    const targetRole = (await teamMembershipInfo(context.db, id))?.role ?? null;
    if (targetRole === "admin" && !isTeamOwner(context.user)) {
      throw new ForbiddenError(
        "Only the owner can reset another administrator's password.",
      );
    }
    const authUserId = await getAuthUserIdByFlaremoUserId(context.db, id);
    if (!authUserId) {
      throw new NotFoundError("Member not found");
    }
    const auth = createFlareMoAuth(c.env, context.db);
    const token = await auth.createPasswordResetToken(authUserId);
    const response = c.json({
      token,
      reset_path: `/reset?token=${encodeURIComponent(token)}`,
      expires_in_seconds: 60 * 60,
    });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    return jsonError(c, error);
  }
});
