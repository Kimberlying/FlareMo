import type { FlareMoDb } from "@flaremo/db";
import { OWNER_FLAREMO_USER_ID } from "./auth";
import { NotFoundError, ValidationError } from "./errors";
import { getStoredSetting, upsertStoredSetting } from "./settings";
import { getFlaremoUserById } from "./users";

/**
 * Instance-level plugin configuration, stored under the owner's settings row
 * (same instance-scoped pattern as `flaremo.instance.BRANDING`). The server
 * holds the *shape*, never the plugin list: plugins and their contributions
 * live in the frontend bundle, so an installed plugin that a newer app version
 * removed simply drops out of the intersection instead of breaking the
 * instance. Unknown ids are kept as-is (harmless) and unknown option values
 * are dropped.
 *
 * Semantics of the two override lists:
 * - Official plugins default to enabled; community plugins default to off.
 * - `enabledPlugins` forces a plugin on (the path by which a community plugin
 *   becomes visible), `disabledPlugins` forces one off.
 */

export const PLUGINS_SETTING_KEY = "flaremo.instance.PLUGINS";
export const PLUGIN_LIST_LIMIT = 50;
export const PLUGIN_OPTIONS_MAX_BYTES = 8 * 1024;
/** R2 prefix owned by the plugin store: `plugins/<id>/<version>/<file>`. */
export const PLUGIN_R2_PREFIX = "plugins/";
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function pluginAssetPrefix(id: string, version: string): string {
  return `${PLUGIN_R2_PREFIX}${id}/${version}/`;
}

/** The instance-relative URL prefix the assets of one installed plugin. */
export function pluginAssetBaseUrl(id: string, version: string): string {
  return `/api/app/plugins/assets/${id}/${version}`;
}
/** Option keys are plain JSON keys (camelCase is the convention), not ids. */
const OPTION_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

export type ShareCardSettings = {
  /** Partial order over card ids; unlisted cards keep their registry order. */
  order: string[];
  /** Card ids the instance hides from the picker. */
  hidden: string[];
  /** Preferred default card; must end up visible, else ignored. */
  default: string | null;
  /** Per-card option values (primitive only). */
  options: Record<string, Record<string, string | number | boolean>>;
};

/**
 * A store-installed plugin: the manifest is snapshotted at install time so
 * the public config endpoint can hand the full card list to the share dialog
 * without another round trip; the assets themselves live in R2 under
 * `plugins/<id>/<version>/`. `source` names where it came from ("local" for
 * admin uploads, otherwise the directory source id).
 */
export type InstalledPluginRecord = {
  id: string;
  version: string;
  source: string;
  manifest: Record<string, unknown>;
};

/** A store directory the instance can browse beyond the built-in official one. */
export type PluginSourceRecord = {
  id: string;
  name: string;
  url: string;
};

export type PluginSettings = {
  enabledPlugins: string[];
  disabledPlugins: string[];
  installed: InstalledPluginRecord[];
  sources: PluginSourceRecord[];
  cards: ShareCardSettings;
};

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  enabledPlugins: [],
  disabledPlugins: [],
  installed: [],
  sources: [],
  cards: { order: [], hidden: [], default: null, options: {} },
};

type StoredPluginSettings = {
  enabledPlugins?: unknown;
  disabledPlugins?: unknown;
  installed?: unknown;
  sources?: unknown;
  cards?: {
    order?: unknown;
    hidden?: unknown;
    default?: unknown;
    options?: unknown;
  };
};

function normalizeIdList(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError(`${label} must be an array of ids.`);
  }
  if (value.length > PLUGIN_LIST_LIMIT) {
    throw new ValidationError(
      `${label} cannot contain more than ${PLUGIN_LIST_LIMIT} ids.`,
    );
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || !ID_PATTERN.test(raw)) {
      throw new ValidationError(`${label} contains an invalid id.`);
    }
    if (seen.has(raw)) continue;
    seen.add(raw);
    ids.push(raw);
  }
  return ids;
}

function normalizeCardOptions(
  value: unknown,
): Record<string, Record<string, string | number | boolean>> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("cards.options must be an object.");
  }
  const result: Record<string, Record<string, string | number | boolean>> = {};
  for (const [cardId, raw] of Object.entries(value)) {
    if (!ID_PATTERN.test(cardId)) {
      throw new ValidationError("cards.options contains an invalid card id.");
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ValidationError("Each card's options must be an object.");
    }
    const entry: Record<string, string | number | boolean> = {};
    for (const [key, optionValue] of Object.entries(raw)) {
      if (!OPTION_KEY_PATTERN.test(key)) continue;
      const type = typeof optionValue;
      if (type !== "string" && type !== "number" && type !== "boolean") {
        throw new ValidationError("Option values must be primitives.");
      }
      entry[key] = optionValue as string | number | boolean;
    }
    if (Object.keys(entry).length > 0) result[cardId] = entry;
  }
  if (JSON.stringify(result).length > PLUGIN_OPTIONS_MAX_BYTES) {
    throw new ValidationError("cards.options is too large.");
  }
  return result;
}

function readStored(value: unknown): StoredPluginSettings | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as StoredPluginSettings;
}

/**
 * An id can never be both enabled and disabled. The rules:
 * - A patch replaces the lists it names; unnamed lists keep their old values.
 * - An explicitly patched `disabledPlugins` has the final say: its ids are
 *   removed from the enabled list (a later disable always sticks, even if the
 *   id was explicitly enabled before).
 * - An enabled-only patch clears its ids from the current disabled list.
 * - Both lists in one contradictory request resolve to disabled winning (it
 *   names the safer state).
 * Legacy rows written before this rule keep enable-wins on read, since an
 * explicit enable is the only way a community plugin becomes visible.
 */
function applyListPatch(
  patch: PluginSettingsPatch,
  current: PluginSettings,
): { enabledPlugins: string[]; disabledPlugins: string[] } {
  const enabledPlugins =
    patch.enabledPlugins !== undefined
      ? normalizeIdList(patch.enabledPlugins, "enabledPlugins")
      : [...current.enabledPlugins];
  let disabledPlugins =
    patch.disabledPlugins !== undefined
      ? normalizeIdList(patch.disabledPlugins, "disabledPlugins")
      : [...current.disabledPlugins];
  if (patch.disabledPlugins !== undefined) {
    const disabled = new Set(disabledPlugins);
    return {
      enabledPlugins: enabledPlugins.filter((id) => !disabled.has(id)),
      disabledPlugins,
    };
  }
  if (patch.enabledPlugins !== undefined) {
    const enabled = new Set(enabledPlugins);
    disabledPlugins = disabledPlugins.filter((id) => !enabled.has(id));
  }
  return { enabledPlugins, disabledPlugins };
}

function withoutOverlap(
  enabledPlugins: string[],
  disabledPlugins: string[],
): { enabledPlugins: string[]; disabledPlugins: string[] } {
  const enabled = new Set(enabledPlugins);
  return {
    enabledPlugins,
    disabledPlugins: disabledPlugins.filter((id) => !enabled.has(id)),
  };
}

function normalizeInstalled(value: unknown): InstalledPluginRecord[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError("installed must be an array.");
  }
  if (value.length > PLUGIN_LIST_LIMIT) {
    throw new ValidationError(
      `installed cannot contain more than ${PLUGIN_LIST_LIMIT} plugins.`,
    );
  }
  const seen = new Set<string>();
  const records: InstalledPluginRecord[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ValidationError("installed contains an invalid record.");
    }
    const record = raw as Record<string, unknown>;
    if (typeof record.id !== "string" || !ID_PATTERN.test(record.id)) {
      throw new ValidationError("installed contains an invalid id.");
    }
    if (typeof record.version !== "string" || record.version.length > 64) {
      throw new ValidationError("installed contains an invalid version.");
    }
    if (typeof record.source !== "string" || record.source.length > 64) {
      throw new ValidationError("installed contains an invalid source.");
    }
    if (
      typeof record.manifest !== "object" ||
      record.manifest === null ||
      Array.isArray(record.manifest)
    ) {
      throw new ValidationError("installed contains an invalid manifest.");
    }
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    records.push({
      id: record.id,
      version: record.version,
      source: record.source,
      manifest: record.manifest as Record<string, unknown>,
    });
  }
  return records;
}

function normalizeSources(value: unknown): PluginSourceRecord[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError("sources must be an array.");
  }
  if (value.length > 20) {
    throw new ValidationError("sources cannot contain more than 20 entries.");
  }
  const seen = new Set<string>();
  const records: PluginSourceRecord[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new ValidationError("sources contains an invalid record.");
    }
    const record = raw as Record<string, unknown>;
    if (typeof record.id !== "string" || !ID_PATTERN.test(record.id)) {
      throw new ValidationError("sources contains an invalid id.");
    }
    if (typeof record.name !== "string" || record.name.trim().length === 0) {
      throw new ValidationError("sources contains an invalid name.");
    }
    if (typeof record.url !== "string" || record.url.length > 2000) {
      throw new ValidationError("sources contains an invalid url.");
    }
    if (!/^https:\/\//i.test(record.url)) {
      throw new ValidationError("source urls must use https.");
    }
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    records.push({
      id: record.id,
      name: record.name.trim().slice(0, 80),
      url: record.url.trim(),
    });
  }
  return records;
}

/** Normalize stored settings, falling back to defaults on any invalid shape. */
export function normalizePluginSettings(
  stored: StoredPluginSettings | null,
): PluginSettings {
  if (!stored) return DEFAULT_PLUGIN_SETTINGS;
  try {
    const cards = stored.cards ?? {};
    const defaultId =
      typeof cards.default === "string" && ID_PATTERN.test(cards.default)
        ? cards.default
        : null;
    const lists = withoutOverlap(
      normalizeIdList(stored.enabledPlugins, "enabledPlugins"),
      normalizeIdList(stored.disabledPlugins, "disabledPlugins"),
    );
    return {
      enabledPlugins: lists.enabledPlugins,
      disabledPlugins: lists.disabledPlugins,
      installed: normalizeInstalled(stored.installed),
      sources: normalizeSources(stored.sources),
      cards: {
        order: normalizeIdList(cards.order, "cards.order"),
        hidden: normalizeIdList(cards.hidden, "cards.hidden"),
        default: defaultId,
        options: normalizeCardOptions(cards.options),
      },
    };
  } catch {
    // A hand-edited row must never take the instance down; defaults win.
    return DEFAULT_PLUGIN_SETTINGS;
  }
}

const EMPTY_SETTINGS: PluginSettings = { ...DEFAULT_PLUGIN_SETTINGS };

export async function getPluginSettings(
  db: FlareMoDb,
): Promise<PluginSettings> {
  const owner = await getFlaremoUserById(db, OWNER_FLAREMO_USER_ID);
  if (!owner) return EMPTY_SETTINGS;
  const stored = await getStoredSetting(db, owner, PLUGINS_SETTING_KEY);
  return normalizePluginSettings(readStored(stored?.value));
}

export type PluginSettingsPatch = {
  enabledPlugins?: string[];
  disabledPlugins?: string[];
  installed?: InstalledPluginRecord[];
  sources?: PluginSourceRecord[];
  cards?: {
    order?: string[];
    hidden?: string[];
    default?: string | null;
    options?: Record<string, Record<string, string | number | boolean>>;
  };
};

/**
 * Merge a patch into the stored settings and persist. Arrays replace wholesale
 * (the admin UI sends the full desired state); omitted fields are preserved.
 */
export async function setPluginSettings(
  db: FlareMoDb,
  patch: PluginSettingsPatch,
): Promise<PluginSettings> {
  const owner = await getFlaremoUserById(db, OWNER_FLAREMO_USER_ID);
  if (!owner) throw new NotFoundError("Owner not found");
  const current = await getPluginSettings(db);
  const lists = applyListPatch(patch, current);
  const next: PluginSettings = {
    enabledPlugins: lists.enabledPlugins,
    disabledPlugins: lists.disabledPlugins,
    installed:
      patch.installed !== undefined
        ? normalizeInstalled(patch.installed)
        : current.installed,
    sources:
      patch.sources !== undefined
        ? normalizeSources(patch.sources)
        : current.sources,
    cards: {
      order:
        patch.cards?.order !== undefined
          ? normalizeIdList(patch.cards.order, "cards.order")
          : current.cards.order,
      hidden:
        patch.cards?.hidden !== undefined
          ? normalizeIdList(patch.cards.hidden, "cards.hidden")
          : current.cards.hidden,
      default:
        patch.cards?.default !== undefined
          ? (() => {
              const raw = patch.cards.default;
              if (raw === null) return null;
              if (typeof raw !== "string" || !ID_PATTERN.test(raw)) {
                throw new ValidationError("cards.default must be a valid id.");
              }
              return raw;
            })()
          : current.cards.default,
      options:
        patch.cards?.options !== undefined
          ? normalizeCardOptions(patch.cards.options)
          : current.cards.options,
    },
  };
  await upsertStoredSetting(db, owner, PLUGINS_SETTING_KEY, next);
  return next;
}
