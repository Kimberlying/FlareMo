import {
  type BundledShareCard,
  DEFAULT_SHARE_CARD_SIZE,
  listBundledPluginsSorted,
  type ShareCardDocument,
  type ShareCardKind,
  type ShareCardOptionSpec,
  type ShareCardSize,
  validatePluginManifest,
} from "@flaremo/plugins";
import type { PluginSettings } from "@/api";

/**
 * The share-card picker works over two families of cards with one shape:
 * bundled cards (compiled into the app from `plugins/`) and installed cards
 * (store packages whose payloads live in R2 and are fetched on demand).
 * This module turns instance plugin settings into that unified list and
 * loads payloads. Anything invalid is skipped, never fatal: a broken
 * installed package must not take the dialog down.
 */

export type ShareCardSource = "bundled" | "installed";

export type ShareCardView = {
  id: string;
  pluginId: string;
  pluginVersion: string;
  pluginTier: "official" | "community";
  source: ShareCardSource;
  kind: ShareCardKind;
  name: Record<string, string>;
  description?: Record<string, string>;
  size: ShareCardSize;
  options?: ShareCardOptionSpec[];
  /** Bundled only. */
  bundled?: BundledShareCard;
  /** Installed only: URL base of the package's assets. */
  assetBase?: string;
  /** Installed only: path inside the package. */
  payloadPath?: string;
};

export type CardPayload =
  | { kind: "document"; document: ShareCardDocument }
  | { kind: "sandbox"; html: string };

export function pluginAssetBase(id: string, version: string): string {
  return `/api/app/plugins/assets/${id}/${version}`;
}

function bundledViews(): ShareCardView[] {
  return listBundledPluginsSorted().flatMap((plugin) =>
    plugin.cards.map((card) => ({
      id: card.id,
      pluginId: plugin.manifest.id,
      pluginVersion: plugin.manifest.version,
      pluginTier: plugin.tier,
      source: "bundled" as const,
      kind: card.kind,
      name: card.name,
      ...(card.description ? { description: card.description } : {}),
      size: card.size ?? DEFAULT_SHARE_CARD_SIZE,
      ...(card.options ? { options: card.options } : {}),
      bundled: card,
    })),
  );
}

/** Every card the app knows about, bundled plus installed (undeduplicated). */
export function allCardViews(settings: PluginSettings | null): ShareCardView[] {
  const bundled = bundledViews();
  const bundledIds = new Set(bundled.map((card) => card.id));
  const installed: ShareCardView[] = [];
  for (const record of settings?.installed ?? []) {
    const { manifest } = validatePluginManifest(record.manifest);
    if (!manifest || manifest.id !== record.id) continue;
    const assetBase = pluginAssetBase(record.id, record.version);
    for (const card of manifest.contributes.shareCardTemplates ?? []) {
      // A bundled card always wins the id; an installed package cannot shadow
      // the cards compiled into the app.
      if (bundledIds.has(card.id)) continue;
      installed.push({
        id: card.id,
        pluginId: record.id,
        pluginVersion: record.version,
        pluginTier: "community",
        source: "installed",
        kind: card.kind,
        name: card.name,
        ...(card.description ? { description: card.description } : {}),
        size: card.size ?? DEFAULT_SHARE_CARD_SIZE,
        ...(card.options ? { options: card.options } : {}),
        assetBase,
        payloadPath: card.kind === "document" ? card.document : card.entry,
      });
    }
  }
  return [...bundled, ...installed];
}

export type CardVisibilityInput = {
  enabledPlugins: string[];
  disabledPlugins: string[];
  cards: { order: string[]; hidden: string[] };
};

/**
 * Visible cards = (all cards ∩ instance configuration): a plugin shows when
 * its default says so unless explicitly enabled/disabled, hidden cards drop
 * out, configured order wins for the ids it names.
 *
 * Defaults: bundled **official** plugins are on; bundled community packs,
 * store installs and local uploads are off until the instance enables them —
 * a brand pack must never appear on instances that never asked for it. When
 * the configuration is missing or hides everything, the fallback is the
 * bundled official cards only (still brand-free), so the dialog can never
 * render without a card and can never resurrect a hidden brand card.
 */
export function visibleCardViews(
  settings: PluginSettings | null,
): ShareCardView[] {
  const all = allCardViews(settings);
  const official = all.filter(
    (card) => card.source === "bundled" && card.pluginTier === "official",
  );
  const fallback = official.length > 0 ? official : all;
  if (!settings) return fallback;
  const enabled = new Set(settings.enabledPlugins);
  const disabled = new Set(settings.disabledPlugins);
  const hidden = new Set(settings.cards.hidden);
  const defaultEnabled = (card: ShareCardView) =>
    card.source === "bundled" && card.pluginTier === "official";
  const registryOrder = new Map(all.map((card, index) => [card.id, index]));
  const visible = all.filter((card) => {
    const pluginVisible = enabled.has(card.pluginId)
      ? true
      : disabled.has(card.pluginId)
        ? false
        : defaultEnabled(card);
    return pluginVisible && !hidden.has(card.id);
  });
  if (visible.length === 0) return fallback;
  const orderIndex = new Map(
    settings.cards.order.map((id, index) => [id, index] as const),
  );
  return [...visible].sort((a, b) => {
    const aOrder = orderIndex.get(a.id);
    const bOrder = orderIndex.get(b.id);
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    return (registryOrder.get(a.id) ?? 0) - (registryOrder.get(b.id) ?? 0);
  });
}

/** Load a card's payload: bundled cards carry it; installed cards fetch it. */
export async function loadCardPayload(
  card: ShareCardView,
): Promise<CardPayload> {
  if (card.source === "bundled" && card.bundled) {
    return card.bundled.payload;
  }
  if (!card.assetBase || !card.payloadPath) {
    throw new Error("installed card is missing its asset path");
  }
  const url = `${card.assetBase}/${card.payloadPath}`;
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`could not load the card (${response.status})`);
  }
  if (card.kind === "document") {
    const parsed = (await response.json()) as ShareCardDocument;
    if (!parsed || typeof parsed !== "object" || !parsed.root) {
      throw new Error("card document is malformed");
    }
    return { kind: "document", document: parsed };
  }
  const html = await response.text();
  if (!html.trim()) throw new Error("card entry is empty");
  return { kind: "sandbox", html };
}
