import {
  applyFlaremoMigrations,
  authUsers,
  createDb,
  memos,
  type UserRow,
  users,
} from "@flaremo/db";
import { eq } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { completeOwnerBootstrap, getViewerTeamMembership } from "./auth";
import { ConflictError, ForbiddenError, ValidationError } from "./errors";
import { createMemo } from "./memos";
import type { TeamViewer } from "./team-permissions";
import {
  beginFlaremoMemberRemoval,
  createFlaremoMember,
  createFlaremoMemberWithLink,
  ensureSingleUser,
  finalizeFlaremoMemberRemoval,
  getDefaultTeam,
  getFlaremoUserById,
  grantTeamReader,
  revokeTeamReader,
  updateFlaremoUserEmail,
  updateTeamMemberRole,
} from "./users";

let mf: Miniflare;
let db: ReturnType<typeof createDb>;
let user: UserRow;
const OWNER_AUTH_USER_ID = "auth/owner";

async function createTestAuthUser(
  authUserId: string,
  email: string,
  name: string,
): Promise<void> {
  const now = new Date();
  await db.insert(authUsers).values({
    id: authUserId,
    email,
    name,
    emailVerified: true,
    image: null,
    username: email.split("@")[0],
    displayUsername: name,
    createdAt: now,
    updatedAt: now,
  });
}

/** Create a member through the real provisioning path (identity, link, team). */
async function createMember(
  name: string,
): Promise<{ id: string; authUserId: string; viewer: TeamViewer }> {
  const slug = name.toLowerCase().replaceAll(" ", "-");
  const email = `${slug}@example.com`;
  const authUserId = `auth/${slug}`;
  await createTestAuthUser(authUserId, email, name);
  const member = await createFlaremoMemberWithLink(db, {
    authUserId,
    email,
    name,
  });
  const membership = await getViewerTeamMembership(db, authUserId);
  expect(membership).toMatchObject({ role: "member" });
  return {
    id: member.id,
    authUserId,
    viewer: {
      ...member,
      teamRole: membership!.role,
      teamOrganizationId: membership!.organizationId,
    },
  };
}

describe("team users", () => {
  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-users-test" },
    });
    const database = await mf.getD1Database("DB");
    db = createDb(database);
    await applyFlaremoMigrations(database);
    user = await ensureSingleUser(db, {
      email: "owner@example.com",
      name: "Owner",
    });
    // The bootstrap owner joins the default team through the same path the
    // worker's setup flow uses.
    await createTestAuthUser(OWNER_AUTH_USER_ID, "owner@example.com", "Owner");
    await completeOwnerBootstrap(db, {
      authUserId: OWNER_AUTH_USER_ID,
      singleUser: { email: "owner@example.com", name: "Owner" },
    });
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("updates the domain user's email and normalizes it to lowercase", async () => {
    const updated = await updateFlaremoUserEmail(
      db,
      user,
      "New.Owner@Example.com",
    );
    expect(updated.email).toBe("new.owner@example.com");
  });

  it("rejects an invalid email address", async () => {
    await expect(
      updateFlaremoUserEmail(db, user, "not-an-email"),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an email already taken by another user", async () => {
    await createFlaremoMember(db, {
      email: "other@example.com",
      name: "Other",
    });
    await expect(
      updateFlaremoUserEmail(db, user, "other@example.com"),
    ).rejects.toThrow(ConflictError);
  });

  it("allows re-using the current email value", async () => {
    const updated = await updateFlaremoUserEmail(db, user, "owner@example.com");
    expect(updated.email).toBe("owner@example.com");
  });

  it("publishes team memos into the default team and personal memos into none", async () => {
    const member = await createMember("Member");
    const team = await getDefaultTeam(db);
    expect(team).not.toBeNull();

    const teamMemo = await createMemo(db, member.viewer, {
      content: "team",
      visibility: "protected",
      source: "web",
    });
    expect(teamMemo.teamId).toBe(team!.id);

    const personalMemo = await createMemo(db, member.viewer, {
      content: "personal",
      visibility: "private",
      source: "web",
    });
    expect(personalMemo.teamId).toBeNull();
  });

  it("denies team publishing for readers but keeps personal notes working", async () => {
    const member = await createMember("Reader");
    await grantTeamReader(db, {
      authUserId: member.authUserId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const membership = await getViewerTeamMembership(db, member.authUserId);
    expect(membership).toMatchObject({ role: "reader" });
    const reader = { ...member.viewer, teamRole: "reader" as const };

    await expect(
      createMemo(db, reader, {
        content: "team",
        visibility: "protected",
        source: "web",
      }),
    ).rejects.toThrow(ForbiddenError);
    // Personal notes stay fully available to the read-only seat.
    const personal = await createMemo(db, reader, {
      content: "personal",
      visibility: "private",
      source: "web",
    });
    expect(personal.teamId).toBeNull();
  });

  it("cuts off access automatically when the reader seat expires", async () => {
    const member = await createMember("Lapsed");
    // Grant, then lapse: the past-dated expiry folds the membership out at
    // the single fail-closed gate (getViewerTeamMembership) — no cron needed.
    await grantTeamReader(db, {
      authUserId: member.authUserId,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await getViewerTeamMembership(db, member.authUserId)).toBeNull();

    // Renewal from the admin restores access immediately.
    await grantTeamReader(db, {
      authUserId: member.authUserId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(await getViewerTeamMembership(db, member.authUserId)).toMatchObject({
      role: "reader",
    });

    // Revocation removes the membership row entirely.
    await revokeTeamReader(db, member.authUserId);
    expect(await getViewerTeamMembership(db, member.authUserId)).toBeNull();
  });

  it("removes private data and adopts team content into the owner account", async () => {
    const member = await createMember("Member");
    const privateMemo = await createMemo(db, member.viewer, {
      content: "private",
      visibility: "private",
      source: "web",
    });
    const teamMemo = await createMemo(db, member.viewer, {
      content: "team",
      visibility: "protected",
      source: "web",
    });

    const artifacts = await beginFlaremoMemberRemoval(db, member.id);
    expect(artifacts.memoIds).toEqual([privateMemo.id]);
    expect((await getFlaremoUserById(db, member.id))?.status).toBe("removed");

    await finalizeFlaremoMemberRemoval(db, member.id, artifacts);
    const adopted = await db
      .select()
      .from(memos)
      .where(eq(memos.id, teamMemo.id))
      .get();
    expect(adopted).toMatchObject({ userId: "users/owner" });
    expect(await getFlaremoUserById(db, member.id)).toMatchObject({
      name: "Member",
      status: "removed",
    });
  });

  it("supports assigning and removing the team administrator role", async () => {
    const member = await createMember("Admin");
    await updateTeamMemberRole(db, member.authUserId, "admin");
    expect((await getViewerTeamMembership(db, member.authUserId))?.role).toBe(
      "admin",
    );
    await updateTeamMemberRole(db, member.authUserId, "member");
    expect((await getViewerTeamMembership(db, member.authUserId))?.role).toBe(
      "member",
    );
  });

  it("removes a second administrator while the owner stays active", async () => {
    const secondAdmin = await createMember("Second Admin");
    await updateTeamMemberRole(db, secondAdmin.authUserId, "admin");

    const artifacts = await beginFlaremoMemberRemoval(db, secondAdmin.id);
    await finalizeFlaremoMemberRemoval(db, secondAdmin.id, artifacts);
    expect((await getFlaremoUserById(db, secondAdmin.id))?.status).toBe(
      "removed",
    );
    expect((await getFlaremoUserById(db, user.id))?.status).toBe("active");
  });

  it("rejects demoting the last active administrator", async () => {
    const lastAdmin = await createMember("Last Admin");
    await updateTeamMemberRole(db, lastAdmin.authUserId, "admin");
    // Simulate a degraded deployment whose owner row no longer holds an
    // administrator membership; the guard must then keep `lastAdmin` in place.
    await db
      .update(users)
      .set({ status: "removed" })
      .where(eq(users.id, user.id));

    const error = await updateTeamMemberRole(
      db,
      lastAdmin.authUserId,
      "member",
    ).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as Error).message).toBe(
      "The last active administrator cannot be changed.",
    );
    expect(
      (await getViewerTeamMembership(db, lastAdmin.authUserId))?.role,
    ).toBe("admin");
    expect((await getFlaremoUserById(db, lastAdmin.id))?.status).toBe("active");
  });

  it("rejects removing the last active administrator", async () => {
    const lastAdmin = await createMember("Last Admin");
    await updateTeamMemberRole(db, lastAdmin.authUserId, "admin");
    await db
      .update(users)
      .set({ status: "removed" })
      .where(eq(users.id, user.id));

    const error = await beginFlaremoMemberRemoval(db, lastAdmin.id).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as Error).message).toBe(
      "The last active administrator cannot be changed.",
    );
    expect((await getFlaremoUserById(db, lastAdmin.id))?.status).toBe("active");
  });

  it("rejects demoting or removing the owner account", async () => {
    const roleError = await updateTeamMemberRole(
      db,
      OWNER_AUTH_USER_ID,
      "member",
    ).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(roleError).toBeInstanceOf(ForbiddenError);
    expect((roleError as Error).message).toBe(
      "The owner role cannot be changed.",
    );

    const removalError = await beginFlaremoMemberRemoval(
      db,
      "users/owner",
    ).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(removalError).toBeInstanceOf(ForbiddenError);
    expect((removalError as Error).message).toBe(
      "The owner account cannot be removed.",
    );

    const owner = await getFlaremoUserById(db, user.id);
    expect(owner).toMatchObject({ status: "active" });
  });
});
