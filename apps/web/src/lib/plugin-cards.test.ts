import { describe, expect, it } from "vitest";
import type { PluginSettings } from "@/api";
import { allCardViews, visibleCardViews } from "./plugin-cards";

/**
 * These tests pin the visibility rules of the share-card picker, in
 * particular the brand-safety default: bundled official plugins are on,
 * while bundled community packs / store installs / local uploads stay off
 * until the instance explicitly enables them.
 */

function settings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return {
    enabledPlugins: [],
    disabledPlugins: [],
    installed: [],
    sources: [],
    cards: { order: [], hidden: [], default: null, options: {} },
    ...overrides,
  };
}

const installedManifest = {
  specVersion: 1,
  id: "extra-pack",
  version: "1.0.0",
  name: { "en-US": "Extra pack" },
  contributes: {
    shareCardTemplates: [
      {
        id: "extra-card",
        kind: "document",
        name: { "en-US": "Extra" },
        document: "cards/extra.json",
      },
    ],
  },
};

describe("visibleCardViews defaults", () => {
  it("shows bundled official cards and keeps the community pack off", () => {
    const ids = visibleCardViews(settings()).map((card) => card.id);
    expect(ids).toContain("plain");
    expect(ids).toContain("ticket");
    expect(ids).not.toContain("kosx-editorial");
  });

  it("null settings fall back to bundled official cards only", () => {
    const ids = visibleCardViews(null).map((card) => card.id);
    expect(ids).toEqual(expect.arrayContaining(["plain", "daily", "ticket"]));
    expect(ids).not.toContain("kosx-editorial");
  });

  it("an explicitly enabled community pack becomes visible", () => {
    const ids = visibleCardViews(
      settings({ enabledPlugins: ["kosx-pack"] }),
    ).map((card) => card.id);
    expect(ids).toContain("kosx-editorial");
  });

  it("a disabled official plugin disappears", () => {
    const ids = visibleCardViews(
      settings({ disabledPlugins: ["flaremo-cards"] }),
    ).map((card) => card.id);
    expect(ids).not.toContain("plain");
    expect(ids).not.toContain("kosx-editorial");
  });

  it("installed packages stay off until enabled, even from the official directory", () => {
    const withInstall = settings({
      installed: [
        {
          id: "extra-pack",
          version: "1.0.0",
          source: "official",
          manifest: installedManifest,
        },
      ],
    });
    expect(allCardViews(withInstall).map((card) => card.id)).toContain(
      "extra-card",
    );
    expect(visibleCardViews(withInstall).map((card) => card.id)).not.toContain(
      "extra-card",
    );
    expect(
      visibleCardViews(
        settings({
          ...withInstall,
          enabledPlugins: ["extra-pack"],
        }),
      ).map((card) => card.id),
    ).toContain("extra-card");
  });

  it("hidden cards drop out and configured order wins", () => {
    const visible = visibleCardViews(
      settings({
        cards: {
          order: ["ticket", "plain"],
          hidden: ["daily"],
          default: null,
          options: {},
        },
      }),
    );
    const ids = visible.map((card) => card.id);
    expect(ids).not.toContain("daily");
    expect(ids.indexOf("ticket")).toBeLessThan(ids.indexOf("plain"));
  });

  it("falling back after everything is hidden never resurrects the brand pack", () => {
    const visible = visibleCardViews(
      settings({
        disabledPlugins: ["flaremo-cards", "sandbox-demo", "kosx-pack"],
      }),
    );
    const ids = visible.map((card) => card.id);
    expect(ids).not.toContain("kosx-editorial");
    expect(ids.length).toBeGreaterThan(0);
  });
});
