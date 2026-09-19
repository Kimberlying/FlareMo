import { type FlareMoDb, integrationConfig } from "@flaremo/db";
import { and, eq } from "drizzle-orm";

import { isInstanceOwner, type TeamViewer } from "./team-permissions";

/**
 * Instance-wide integration settings (transactional email, OAuth providers)
 * that carry secrets. Rows live in `integration_config` under the same
 * encrypted-envelope discipline as `voice_service_config`: the caller seals
 * the payload and this module only stores the ciphertext plus a revision
 * used for optimistic concurrency between concurrently open admin forms.
 */

export type IntegrationId = "email" | "oauth";

export function canManageInstanceIntegrations(
  user: TeamViewer | null,
): boolean {
  return isInstanceOwner(user);
}

export type IntegrationRow = {
  id: string;
  revision: string;
  enabled: boolean;
  ciphertext: string | null;
};

export async function readIntegrationConfig(
  db: FlareMoDb,
  id: IntegrationId,
): Promise<IntegrationRow | null> {
  const row = await db.query.integrationConfig.findFirst({
    where: eq(integrationConfig.id, id),
  });
  return row ?? null;
}

// Revision matching prevents two open admin forms from overwriting each other.
export async function writeIntegrationConfig(
  db: FlareMoDb,
  id: IntegrationId,
  previous: string | null,
  value: { enabled: boolean; ciphertext: string | null },
): Promise<boolean> {
  const revision = crypto.randomUUID();
  if (previous === null) {
    const rows = await db
      .insert(integrationConfig)
      .values({ id, revision, ...value })
      .onConflictDoNothing()
      .returning({ revision: integrationConfig.revision });
    return rows.length > 0;
  }
  const rows = await db
    .update(integrationConfig)
    .set({ revision, ...value })
    .where(
      and(
        eq(integrationConfig.id, id),
        eq(integrationConfig.revision, previous),
      ),
    )
    .returning({ revision: integrationConfig.revision });
  return rows.length > 0;
}
