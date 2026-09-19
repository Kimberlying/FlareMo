import { describe, expect, it } from "vitest";
import { listBundledPlugins, listBundledPluginsSorted } from "./registry";
import { DEFAULT_SHARE_CARD_SIZE } from "./spec";

describe("bundled plugin registry", () => {
  it("discovers the bundled official plugins", () => {
    const plugins = listBundledPlugins().map((plugin) => plugin.manifest.id);
    expect(plugins).toContain("flaremo-cards");
    expect(plugins).toContain("sandbox-demo");
  });

  it("resolves document payloads for the basic cards", () => {
    const basics = listBundledPlugins().find(
      (plugin) => plugin.manifest.id === "flaremo-cards",
    );
    expect(basics?.tier).toBe("official");
    expect(basics?.cards.map((card) => card.id)).toEqual([
      "plain",
      "daily",
      "ticket",
      "postcard",
      "quote",
      "mono",
      "zen",
      "ember",
    ]);
    for (const card of basics?.cards ?? []) {
      expect(card.payload.kind).toBe("document");
      if (card.payload.kind === "document") {
        expect(card.payload.document.specVersion).toBe(1);
        expect(card.payload.document.root).toBeTruthy();
      }
    }
  });

  it("resolves raw HTML for sandbox contributions", () => {
    const demo = listBundledPlugins().find(
      (plugin) => plugin.manifest.id === "sandbox-demo",
    );
    const card = demo?.cards[0];
    expect(card?.payload.kind).toBe("sandbox");
    if (card?.payload.kind === "sandbox") {
      expect(card.payload.html).toContain("__flaremoCaptureTarget");
      expect(card.payload.html).toContain("__flaremoOnUpdate");
    }
  });

  it("carries a localized name for every card", () => {
    for (const plugin of listBundledPlugins()) {
      for (const card of plugin.cards) {
        expect(Object.keys(card.name).length).toBeGreaterThan(0);
        expect(card.name["zh-CN"] ?? card.name["en-US"]).toBeTruthy();
      }
    }
  });

  it("sorts official plugins before community ones", () => {
    const sorted = listBundledPluginsSorted();
    const tiers = sorted.map((plugin) => plugin.tier);
    expect(tiers.indexOf("official")).toBeLessThanOrEqual(
      tiers.lastIndexOf("official"),
    );
    if (tiers.includes("community")) {
      expect(tiers.lastIndexOf("official")).toBeLessThan(
        tiers.indexOf("community"),
      );
    }
  });

  it("applies the default card size to contributions that omit one", () => {
    const basics = listBundledPlugins().find(
      (plugin) => plugin.manifest.id === "flaremo-cards",
    );
    expect(basics?.cards[0]?.size).toEqual(DEFAULT_SHARE_CARD_SIZE);
  });
});
