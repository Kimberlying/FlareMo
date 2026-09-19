import {
  DEFAULT_SHARE_CARD_SIZE,
  type LocalizedText,
  PLUGIN_ID_PATTERN,
  PLUGIN_SPEC_VERSION,
  type PluginAuthor,
  type PluginManifest,
  SHARE_CARD_SIZE_LIMITS,
  type ShareCardContribution,
  type ShareCardOptionSpec,
} from "./spec";

/**
 * Pure manifest/contribution validation shared by every consumer of plugin
 * packages: the build-time registry (bundled plugins), the package reader
 * (uploaded + store zip files) and the web app's defensive parsing of
 * installed manifests. No I/O, no globs — safe to import from workers,
 * scripts, and the browser.
 */

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLocalizedText(value: unknown): value is LocalizedText {
  if (!isPlainObject(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    entries.every(([key, text]) => key.length > 0 && typeof text === "string")
  );
}

export function getLocalized(
  value: LocalizedText | undefined,
  locale: string,
): string | undefined {
  if (!value) return undefined;
  const exact = value[locale];
  if (typeof exact === "string") return exact;
  const base = locale.split("-")[0]?.toLowerCase();
  if (base) {
    for (const [key, text] of Object.entries(value)) {
      if (key.split("-")[0]?.toLowerCase() === base) return text;
    }
  }
  return value["en-US"] ?? Object.values(value)[0];
}

function validateOptions(
  raw: unknown,
  problems: string[],
): ShareCardOptionSpec[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    problems.push("options must be an array");
    return undefined;
  }
  const seen = new Set<string>();
  const specs: ShareCardOptionSpec[] = [];
  for (const option of raw) {
    if (
      !isPlainObject(option) ||
      typeof option.key !== "string" ||
      !isLocalizedText(option.label)
    ) {
      problems.push("each option needs a string key and a localized label");
      continue;
    }
    if (seen.has(option.key)) {
      problems.push(`duplicate option key "${option.key}"`);
      continue;
    }
    seen.add(option.key);
    const type = option.type;
    if (type === "enum") {
      if (
        !Array.isArray(option.choices) ||
        option.choices.length === 0 ||
        option.choices.some(
          (choice) =>
            !isPlainObject(choice) ||
            typeof choice.value !== "string" ||
            !isLocalizedText(choice.label),
        )
      ) {
        problems.push(`option "${option.key}" needs non-empty choices`);
        continue;
      }
    } else if (
      type !== "boolean" &&
      type !== "text" &&
      type !== "color" &&
      type !== "number"
    ) {
      problems.push(
        `option "${option.key}" has unknown type "${String(type)}"`,
      );
      continue;
    }
    if (option.default !== undefined) {
      const valueType = typeof option.default;
      if (
        type === "boolean"
          ? valueType !== "boolean"
          : valueType !== "string" &&
            !(type === "number" && valueType === "number")
      ) {
        // Numbers accept numbers; text/color/enum accept strings.
        problems.push(`option "${option.key}" default type does not match`);
        continue;
      }
    }
    specs.push(option as ShareCardOptionSpec);
  }
  return specs;
}

export type ContributionValidation = {
  contribution: ShareCardContribution | null;
  problems: string[];
};

export function validateContribution(raw: unknown): ContributionValidation {
  const problems: string[] = [];
  if (!isPlainObject(raw)) {
    return { contribution: null, problems: ["contribution must be an object"] };
  }
  if (typeof raw.id !== "string" || !PLUGIN_ID_PATTERN.test(raw.id)) {
    problems.push(`contribution id "${String(raw.id)}" must be kebab-case`);
  }
  if (raw.kind !== "document" && raw.kind !== "sandbox") {
    problems.push(
      `contribution "${String(raw.id)}" kind must be document or sandbox`,
    );
  }
  if (!isLocalizedText(raw.name)) {
    problems.push(`contribution "${String(raw.id)}" needs a localized name`);
  }
  const size = raw.size;
  if (size !== undefined) {
    if (
      !isPlainObject(size) ||
      typeof size.width !== "number" ||
      typeof size.height !== "number" ||
      size.width < SHARE_CARD_SIZE_LIMITS.min ||
      size.width > SHARE_CARD_SIZE_LIMITS.max ||
      size.height < SHARE_CARD_SIZE_LIMITS.min ||
      size.height > SHARE_CARD_SIZE_LIMITS.max
    ) {
      problems.push(
        `contribution "${String(raw.id)}" size must be within ${SHARE_CARD_SIZE_LIMITS.min}–${SHARE_CARD_SIZE_LIMITS.max}px`,
      );
    }
  }
  if (raw.kind === "document" && typeof raw.document !== "string") {
    problems.push(`contribution "${String(raw.id)}" needs a document path`);
  }
  if (raw.kind === "sandbox" && typeof raw.entry !== "string") {
    problems.push(`contribution "${String(raw.id)}" needs an entry path`);
  }
  if (problems.length > 0) return { contribution: null, problems };
  const options = validateOptions(raw.options, problems);
  if (problems.length > 0) return { contribution: null, problems };
  const contribution: ShareCardContribution = {
    id: raw.id as string,
    kind: raw.kind === "sandbox" ? "sandbox" : "document",
    name: raw.name as LocalizedText,
    size:
      isPlainObject(raw.size) &&
      typeof raw.size.width === "number" &&
      typeof raw.size.height === "number"
        ? { width: raw.size.width, height: raw.size.height }
        : DEFAULT_SHARE_CARD_SIZE,
  };
  if (isLocalizedText(raw.description)) {
    contribution.description = raw.description;
  }
  if (typeof raw.preview === "string") contribution.preview = raw.preview;
  if (options) contribution.options = options;
  if (typeof raw.document === "string") contribution.document = raw.document;
  if (typeof raw.entry === "string") contribution.entry = raw.entry;
  return { contribution, problems: [] };
}

export type ManifestValidation = {
  manifest: PluginManifest | null;
  problems: string[];
};

function normalizeAuthor(raw: unknown): PluginAuthor | undefined {
  if (!isPlainObject(raw) || typeof raw.name !== "string") return undefined;
  return {
    name: raw.name,
    ...(typeof raw.url === "string" ? { url: raw.url } : {}),
    ...(typeof raw.email === "string" ? { email: raw.email } : {}),
  };
}

/**
 * Validate + normalize a manifest. The returned manifest is a fresh object
 * with defaults applied (card sizes) and unknown fields dropped, so every
 * consumer — bundled registry, installer, web app — sees the same shape.
 */
export function validatePluginManifest(raw: unknown): ManifestValidation {
  const problems: string[] = [];
  if (!isPlainObject(raw)) {
    return { manifest: null, problems: ["manifest must be an object"] };
  }
  if (raw.specVersion !== PLUGIN_SPEC_VERSION) {
    problems.push(`specVersion must be ${PLUGIN_SPEC_VERSION}`);
  }
  if (typeof raw.id !== "string" || !PLUGIN_ID_PATTERN.test(raw.id)) {
    problems.push(`id "${String(raw.id)}" must be kebab-case`);
  }
  if (
    typeof raw.version !== "string" ||
    raw.version.length === 0 ||
    raw.version.length > 64
  ) {
    problems.push("version is required");
  }
  if (!isLocalizedText(raw.name)) {
    problems.push("name needs a localized text table");
  }
  if (!isPlainObject(raw.contributes)) {
    problems.push("contributes is required");
  } else if (raw.contributes.shareCardTemplates !== undefined) {
    if (!Array.isArray(raw.contributes.shareCardTemplates)) {
      problems.push("contributes.shareCardTemplates must be an array");
    } else {
      const seen = new Set<string>();
      for (const card of raw.contributes.shareCardTemplates) {
        const { contribution, problems: cardProblems } =
          validateContribution(card);
        problems.push(...cardProblems);
        if (contribution) {
          if (seen.has(contribution.id)) {
            problems.push(`duplicate card id "${contribution.id}"`);
          }
          seen.add(contribution.id);
        }
      }
    }
  }
  if (problems.length > 0) return { manifest: null, problems };

  const contributes = raw.contributes as Record<string, unknown>;
  const cards = Array.isArray(contributes.shareCardTemplates)
    ? (contributes.shareCardTemplates as unknown[])
        .map((card) => validateContribution(card).contribution)
        .filter((card): card is ShareCardContribution => card !== null)
    : [];
  const author = normalizeAuthor(raw.author);
  const manifest: PluginManifest = {
    specVersion: PLUGIN_SPEC_VERSION,
    id: raw.id as string,
    version: raw.version as string,
    name: raw.name as LocalizedText,
    contributes: { shareCardTemplates: cards },
  };
  if (isLocalizedText(raw.description)) manifest.description = raw.description;
  if (author) manifest.author = author;
  if (typeof raw.license === "string") manifest.license = raw.license;
  if (typeof raw.defaultEnabled === "boolean") {
    manifest.defaultEnabled = raw.defaultEnabled;
  }
  if (typeof raw.minAppVersion === "string") {
    manifest.minAppVersion = raw.minAppVersion;
  }
  return { manifest, problems: [] };
}
