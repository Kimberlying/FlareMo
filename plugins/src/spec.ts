/**
 * Plugin platform manifest contracts (spec version 1).
 *
 * A plugin is a folder: `plugin.json` plus its payload files. Bundled plugins
 * live under `plugins/official/` and `plugins/community/` and are discovered at
 * build time; store-installed plugins share the exact same package layout.
 * The platform machinery (discovery, validation, install, sandbox, store) is
 * contribution-independent — `contributes` maps slot names to contribution
 * lists, and v1 implements exactly one slot: `shareCardTemplates`.
 *
 * See `docs/plugin-platform-standard.md` for the full standard.
 */

export const PLUGIN_SPEC_VERSION = 1;

/** A locale-keyed text table: `{ "zh-CN": "…", "en-US": "…" }`. */
export type LocalizedText = Record<string, string>;

export type PluginTier = "official" | "community";

export type PluginAuthor = {
  name: string;
  url?: string;
  email?: string;
};

export type ShareCardKind = "document" | "sandbox";

export type ShareCardOptionValue = string | number | boolean;

export type ShareCardOptionSpec =
  | {
      key: string;
      type: "boolean";
      label: LocalizedText;
      default?: boolean;
    }
  | {
      key: string;
      type: "text";
      label: LocalizedText;
      default?: string;
      maxLength?: number;
    }
  | {
      key: string;
      type: "color";
      label: LocalizedText;
      default?: string;
    }
  | {
      key: string;
      type: "number";
      label: LocalizedText;
      default?: number;
      min?: number;
      max?: number;
      step?: number;
    }
  | {
      key: string;
      type: "enum";
      label: LocalizedText;
      default?: string;
      choices: Array<{ value: string; label: LocalizedText }>;
    };

export type ShareCardSize = { width: number; height: number };

export const DEFAULT_SHARE_CARD_SIZE: ShareCardSize = {
  width: 340,
  height: 420,
};

export const SHARE_CARD_SIZE_LIMITS = { min: 200, max: 1200 } as const;

export type ShareCardContribution = {
  /** Unique across all plugins; kebab-case. */
  id: string;
  kind: ShareCardKind;
  name: LocalizedText;
  description?: LocalizedText;
  /** Card-level preview image path (relative to the plugin folder). */
  preview?: string;
  size?: ShareCardSize;
  options?: ShareCardOptionSpec[];
  /** `kind: "document"` — path to the card document JSON. */
  document?: string;
  /** `kind: "sandbox"` — path to the self-contained HTML entry. */
  entry?: string;
};

export type PluginManifest = {
  specVersion: number;
  id: string;
  version: string;
  name: LocalizedText;
  description?: LocalizedText;
  author?: PluginAuthor;
  license?: string;
  /**
   * Bundled plugins only: whether the app enables the plugin on instances
   * that never touched plugin settings. Official plugins default to true,
   * community plugins to false.
   */
  defaultEnabled?: boolean;
  minAppVersion?: string;
  contributes: {
    shareCardTemplates?: ShareCardContribution[];
  };
};

export const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Hard limits of the package format. Enforced by the extractor (zips) and the
 * checker (folders and zip contents alike) so authors see the same numbers
 * locally that instances enforce on install.
 */
export const PLUGIN_PACKAGE_LIMITS = {
  maxZipBytes: 4 * 1024 * 1024,
  maxFiles: 64,
  maxFileBytes: 4 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
  maxPreviewBytes: 512 * 1024,
  maxFonts: 2,
  maxFontBytes: 400 * 1024,
} as const;

/** A contribution plus the plugin identity it came from. */
export type BundledContribution = ShareCardContribution & {
  pluginId: string;
  pluginVersion: string;
  tier: PluginTier;
};

export type ShareCardPayload =
  | { kind: "document"; document: import("./document").ShareCardDocument }
  | { kind: "sandbox"; html: string };

export type BundledShareCard = BundledContribution & {
  payload: ShareCardPayload;
};

export type BundledPlugin = {
  manifest: PluginManifest;
  tier: PluginTier;
  cards: BundledShareCard[];
};
