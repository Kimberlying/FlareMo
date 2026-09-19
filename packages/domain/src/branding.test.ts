import { applyFlaremoMigrations, authUsers, createDb } from "@flaremo/db";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { completeOwnerBootstrap } from "./auth";
import {
  BRANDING_ACCENT_PRESETS,
  clearBrandingFavicon,
  DEFAULT_BRANDING_ACCENT,
  getBranding,
  normalizeBrandingAccent,
  setBrandingAccent,
  setBrandingProductName,
  upsertBrandingFavicon,
} from "./branding";
import { ValidationError } from "./errors";

let mf: Miniflare;
let db: ReturnType<typeof createDb>;

describe("instance branding accent", () => {
  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-branding-test" },
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

  it("normalizes unknown and missing accents back to the default", () => {
    expect(DEFAULT_BRANDING_ACCENT).toBe("flame");
    expect(normalizeBrandingAccent(undefined, undefined)).toBe("flame");
    expect(normalizeBrandingAccent(null, null)).toBe("flame");
    expect(normalizeBrandingAccent("hacker-green", null)).toBe("flame");
    for (const preset of BRANDING_ACCENT_PRESETS) {
      expect(normalizeBrandingAccent(preset, null)).toBe(preset);
    }
  });

  it("custom accent requires a valid seed hex", () => {
    expect(normalizeBrandingAccent("custom", undefined)).toBe("flame");
    expect(normalizeBrandingAccent("custom", "#GGGGGG")).toBe("flame");
    expect(normalizeBrandingAccent("custom", "#7C3AED")).toBe("custom");
  });

  it("a fresh instance resolves the default accent", async () => {
    const branding = await getBranding(db);
    expect(branding.accent).toBe("flame");
  });

  it("stores and resolves a preset accent", async () => {
    const branding = await setBrandingAccent(db, "iris");
    expect(branding.accent).toBe("iris");
    expect((await getBranding(db)).accent).toBe("iris");
  });

  it("round-trips the accent across other branding writes", async () => {
    await setBrandingAccent(db, "ocean");
    await setBrandingProductName(db, "KOS 知识库");
    expect((await getBranding(db)).accent).toBe("ocean");
    expect((await getBranding(db)).product).toBe("KOS 知识库");
  });

  it("rejects accents outside the whitelist", async () => {
    await expect(setBrandingAccent(db, "neon-magenta")).rejects.toThrow(
      ValidationError,
    );
  });

  it("resetting the accent restores the default", async () => {
    await setBrandingAccent(db, "teal");
    const branding = await setBrandingAccent(db, null);
    expect(branding.accent).toBe("flame");
  });

  it("stores a custom seed and rejects custom without a hex", async () => {
    await expect(setBrandingAccent(db, "custom")).rejects.toThrow(
      ValidationError,
    );
    const branding = await setBrandingAccent(db, "custom", "#7C3AED");
    expect(branding.accent).toBe("custom");
    expect(branding.accentHex).toBe("#7c3aed");
    expect((await getBranding(db)).accent).toBe("custom");
  });

  it("round-trips a custom favicon across other branding writes", async () => {
    await upsertBrandingFavicon(db, "image/x-icon");
    let branding = await getBranding(db);
    expect(branding.favicon).not.toBeNull();
    expect(branding.favicon?.content_type).toBe("image/x-icon");
    expect(branding.favicon?.r2_key).toBe("branding/favicon");
    // Unrelated writes must not drop the favicon record.
    await setBrandingProductName(db, "KOS 知识库");
    await setBrandingAccent(db, "iris");
    branding = await getBranding(db);
    expect(branding.favicon).not.toBeNull();
    expect(branding.product).toBe("KOS 知识库");
    expect(branding.accent).toBe("iris");
    const staleKey = await clearBrandingFavicon(db);
    expect(staleKey).toBe("branding/favicon");
    expect((await getBranding(db)).favicon).toBeNull();
  });

  it("rejects unsupported favicon content types", async () => {
    await expect(upsertBrandingFavicon(db, "text/html")).rejects.toThrow(
      ValidationError,
    );
  });
});
