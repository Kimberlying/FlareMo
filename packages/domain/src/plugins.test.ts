import { applyFlaremoMigrations, authUsers, createDb } from "@flaremo/db";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { completeOwnerBootstrap } from "./auth";
import { ValidationError } from "./errors";
import {
  DEFAULT_PLUGIN_SETTINGS,
  getPluginSettings,
  normalizePluginSettings,
  PLUGIN_LIST_LIMIT,
  setPluginSettings,
} from "./plugins";

describe("plugin settings normalization", () => {
  it("falls back to defaults for missing or malformed rows", () => {
    expect(normalizePluginSettings(null)).toEqual(DEFAULT_PLUGIN_SETTINGS);
    expect(normalizePluginSettings("nope" as never)).toEqual(
      DEFAULT_PLUGIN_SETTINGS,
    );
    expect(normalizePluginSettings({ enabledPlugins: 42 } as never)).toEqual(
      DEFAULT_PLUGIN_SETTINGS,
    );
    expect(
      normalizePluginSettings({ cards: { order: ["Bad_ID!"] } } as never),
    ).toEqual(DEFAULT_PLUGIN_SETTINGS);
  });

  it("dedupes ids and drops non-primitive option values", () => {
    const normalized = normalizePluginSettings({
      enabledPlugins: ["a", "a", "b"],
      disabledPlugins: [],
      cards: {
        order: ["plain", "plain"],
        hidden: [],
        default: "plain",
        options: { plain: { showStats: true, label: "x" } },
      },
    } as never);
    expect(normalized.enabledPlugins).toEqual(["a", "b"]);
    expect(normalized.cards.order).toEqual(["plain"]);
    expect(normalized.cards.options).toEqual({
      plain: { showStats: true, label: "x" },
    });
  });

  it("resets a corrupted row to defaults instead of failing the read", () => {
    // A nested option value is not a primitive: the read path treats the
    // whole row as corrupt and serves defaults, so a hand-edited settings
    // row can never take the instance down.
    const normalized = normalizePluginSettings({
      enabledPlugins: ["cosy-pack"],
      cards: { options: { plain: { nested: { no: true } } } },
    } as never);
    expect(normalized).toEqual(DEFAULT_PLUGIN_SETTINGS);
  });
});

describe("plugin settings persistence", () => {
  let mf: Miniflare;
  let db: ReturnType<typeof createDb>;

  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-plugins-test" },
    });
    const database = await mf.getD1Database("DB");
    db = createDb(database);
    await applyFlaremoMigrations(database);
    const now = new Date();
    await db.insert(authUsers).values({
      id: "auth/owner",
      email: "owner@example.com",
      name: "Owner",
      emailVerified: true,
      image: null,
      username: "owner",
      displayUsername: "Owner",
      createdAt: now,
      updatedAt: now,
    });
    await completeOwnerBootstrap(db, {
      authUserId: "auth/owner",
      singleUser: { email: "owner@example.com", name: "Owner" },
    });
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("defaults to an empty configuration on a fresh instance", async () => {
    expect(await getPluginSettings(db)).toEqual(DEFAULT_PLUGIN_SETTINGS);
  });

  it("round-trips a full configuration", async () => {
    const saved = await setPluginSettings(db, {
      enabledPlugins: ["cosy-pack"],
      disabledPlugins: ["sandbox-demo"],
      cards: {
        order: ["ticket", "plain"],
        hidden: ["daily"],
        default: "ticket",
        options: { ticket: { showStats: false } },
      },
    });
    expect(saved.cards.order).toEqual(["ticket", "plain"]);
    expect(await getPluginSettings(db)).toEqual(saved);
  });

  it("preserves omitted fields when patching", async () => {
    await setPluginSettings(db, {
      disabledPlugins: ["sandbox-demo"],
      cards: { order: ["ticket"], hidden: [], default: "ticket", options: {} },
    });
    const patched = await setPluginSettings(db, {
      cards: { hidden: ["daily"] },
    });
    expect(patched.disabledPlugins).toEqual(["sandbox-demo"]);
    expect(patched.cards.order).toEqual(["ticket"]);
    expect(patched.cards.hidden).toEqual(["daily"]);
    expect(patched.cards.default).toBe("ticket");
  });

  it("rejects oversized or malformed lists", async () => {
    await expect(
      setPluginSettings(db, {
        enabledPlugins: Array.from(
          { length: PLUGIN_LIST_LIMIT + 1 },
          (_, index) => `plugin-${index}`,
        ),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      setPluginSettings(db, { enabledPlugins: ["NOT VALID"] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      setPluginSettings(db, { cards: { default: "Bad_ID" } }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      setPluginSettings(db, {
        cards: {
          options: {
            plain: { nested: { no: true } as never },
          },
        },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("clears the default with null", async () => {
    await setPluginSettings(db, { cards: { default: "ticket" } });
    const cleared = await setPluginSettings(db, { cards: { default: null } });
    expect(cleared.cards.default).toBeNull();
  });

  it("never stores an id as both enabled and disabled", async () => {
    // The explicitly named list decides; within a single contradictory
    // request the disabled list wins (it names the safer state).
    const saved = await setPluginSettings(db, {
      enabledPlugins: ["sandbox-demo"],
      disabledPlugins: ["sandbox-demo", "other-plugin"],
    });
    expect(saved.enabledPlugins).toEqual([]);
    expect(saved.disabledPlugins).toEqual(["sandbox-demo", "other-plugin"]);
    const reread = await getPluginSettings(db);
    expect(reread.enabledPlugins).toEqual([]);
    expect(reread.disabledPlugins).toEqual(["sandbox-demo", "other-plugin"]);
  });

  it("a later disable sticks even after an explicit enable", async () => {
    const enabled = await setPluginSettings(db, {
      enabledPlugins: ["sandbox-demo"],
    });
    expect(enabled.enabledPlugins).toEqual(["sandbox-demo"]);
    const disabled = await setPluginSettings(db, {
      disabledPlugins: ["sandbox-demo"],
    });
    expect(disabled.enabledPlugins).toEqual([]);
    expect(disabled.disabledPlugins).toEqual(["sandbox-demo"]);
  });
});
