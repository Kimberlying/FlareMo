/**
 * Bundled plugin discovery. Folders under `plugins/official/` and
 * `plugins/community/` are picked up at build time — adding a plugin is
 * adding a folder, never touching this file. Invalid manifests fail the
 * build (and the test suite) loudly instead of shipping silently.
 */

import { SHARE_CARD_SPEC_VERSION, type ShareCardDocument } from "./document";
import type {
  BundledPlugin,
  BundledShareCard,
  PluginManifest,
  PluginTier,
} from "./spec";
import { isPlainObject, validatePluginManifest } from "./validate";

const manifestModules = import.meta.glob(
  "../{official,community}/*/plugin.json",
  {
    eager: true,
    import: "default",
  },
) as Record<string, unknown>;

const documentModules = import.meta.glob(
  "../{official,community}/*/cards/**/*.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;

const sandboxModules = import.meta.glob(
  "../{official,community}/*/cards/**/*.html",
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

let cached: BundledPlugin[] | null = null;

/** All bundled plugins with their card payloads resolved; memoized. */
export function listBundledPlugins(): BundledPlugin[] {
  if (cached) return cached;
  const plugins: BundledPlugin[] = [];
  const cardIds = new Map<string, string>();
  const manifestEntries = Object.entries(manifestModules).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [key, raw] of manifestEntries) {
    const tier: PluginTier = key.startsWith("../official/")
      ? "official"
      : "community";
    const folder = key.slice(0, -"plugin.json".length);
    const folderName = folder.replace(/\/$/, "").split("/").pop() ?? "";
    const { manifest: parsed, problems } = validatePluginManifest(raw);
    if (!parsed) {
      throw new Error(`${key}: ${problems.join("; ")}`);
    }
    const manifest: PluginManifest = parsed;
    if (manifest.id !== folderName) {
      throw new Error(
        `${key}: manifest id "${manifest.id}" must match the folder name "${folderName}"`,
      );
    }
    const cards: BundledShareCard[] = [];
    for (const contribution of manifest.contributes.shareCardTemplates ?? []) {
      const duplicate = cardIds.get(contribution.id);
      if (duplicate) {
        throw new Error(
          `${key}: card id "${contribution.id}" is already used by ${duplicate}`,
        );
      }
      cardIds.set(contribution.id, manifest.id);
      const identity = {
        pluginId: manifest.id,
        pluginVersion: manifest.version,
        tier,
      };
      if (contribution.kind === "document") {
        const document =
          documentModules[folder + (contribution.document ?? "")];
        if (!isPlainObject(document)) {
          throw new Error(
            `${key}: card "${contribution.id}" document not found: ${String(contribution.document)}`,
          );
        }
        const parsedDocument = document as unknown as ShareCardDocument;
        if (parsedDocument.specVersion !== SHARE_CARD_SPEC_VERSION) {
          throw new Error(
            `${key}: card "${contribution.id}" document specVersion must be ${SHARE_CARD_SPEC_VERSION}`,
          );
        }
        cards.push({
          ...contribution,
          ...identity,
          payload: { kind: "document", document: parsedDocument },
        });
      } else {
        const html = sandboxModules[folder + (contribution.entry ?? "")];
        if (typeof html !== "string") {
          throw new Error(
            `${key}: card "${contribution.id}" entry not found: ${String(contribution.entry)}`,
          );
        }
        cards.push({
          ...contribution,
          ...identity,
          payload: { kind: "sandbox", html },
        });
      }
    }
    plugins.push({ manifest, tier, cards });
  }
  cached = plugins;
  return plugins;
}

/** Bundled plugins in display order: official first, then by id. */
export function listBundledPluginsSorted(): BundledPlugin[] {
  return [...listBundledPlugins()].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "official" ? -1 : 1;
    return a.manifest.id.localeCompare(b.manifest.id);
  });
}
