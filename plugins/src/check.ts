import {
  BRAND_COLOR_STEPS,
  isUnsafeCSS,
  SHARE_CARD_SPEC_VERSION,
  SHARE_CARD_SVG_TAGS,
  type SvgNode,
} from "./document";
import {
  PLUGIN_PACKAGE_LIMITS,
  type PluginManifest,
  type ShareCardContribution,
} from "./spec";
import { isPlainObject, validatePluginManifest } from "./validate";

/**
 * Deep validation of a plugin package — the author-facing "GScan": structure,
 * manifest, card documents (nodes/styles/colors/bindings/SVG whitelist),
 * sandbox self-containment, previews and assets. Pure (no I/O), so the same
 * code runs in the CLI (`pnpm plugin:check`), in the repo build
 * (`pnpm plugins:build`), and on the instance at upload/install time
 * (`readPluginPackage`), keeping author tooling and instance enforcement
 * identical.
 *
 * Severities: `error` blocks install/build; `warning` is advisory (forward
 * compatible or cosmetic). Unknown node types are errors here even though the
 * runtime skips them — that skip exists for *newer* specs read by older apps,
 * while a v1 document with an unknown node is an author typo.
 */

export type CheckSeverity = "error" | "warning";

export type CheckIssue = {
  severity: CheckSeverity;
  code: string;
  message: string;
  where?: string;
};

export type PluginCheckResult = {
  pluginId: string | null;
  version: string | null;
  manifest: PluginManifest | null;
  issues: CheckIssue[];
  /** True when no issue of severity `error` was found. */
  ok: boolean;
};

export type PluginCheckInput = {
  /** Package-relative paths (the `<id>/` prefix already stripped). */
  files: Record<string, Uint8Array>;
  /** Zip root folder / repo folder name the package must be rooted at. */
  rootFolder?: string;
  /** Repo tier, when known: enables the community governance checks. */
  tier?: "official" | "community";
};

const NODE_TYPES = new Set([
  "row",
  "column",
  "text",
  "image",
  "svg",
  "divider",
  "spacer",
]);

const STYLE_KEYS = new Set([
  "background",
  "backgroundCSS",
  "opacity",
  "borderRadius",
  "borderWidth",
  "borderColor",
  "borderTopWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderRightWidth",
  "borderStyle",
  "shadow",
  "shadowCSS",
  "padding",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "color",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "gap",
  "width",
  "height",
  "flex",
  "align",
  "justify",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "overflow",
  "clamp",
  "rotate",
  "font",
]);

const FONT_KEYS = new Set([
  "family",
  "size",
  "weight",
  "lineHeight",
  "letterSpacing",
  "align",
  "uppercase",
  "color",
]);

const BUILT_IN_FONT_FAMILIES = new Set(["sans", "heading", "serif", "mono"]);

const KNOWN_BINDINGS = new Set([
  "body",
  "date",
  "day",
  "day.padded",
  "stats",
  "locale",
  "brand.product",
  "brand.markLight",
  "brand.markDark",
]);

const COLOR_KEYWORDS = new Set(["none", "currentColor", "transparent"]);

const APP_COLOR_TOKENS = new Set([
  "foreground",
  "background",
  "card",
  "muted",
  "border",
]);

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SVG_FILTER_REF_PATTERN = /^url\(#[A-Za-z0-9_-]+\)$/;

const KNOWN_MANIFEST_KEYS = new Set([
  "specVersion",
  "id",
  "version",
  "name",
  "description",
  "author",
  "license",
  "defaultEnabled",
  "minAppVersion",
  "contributes",
]);

const KNOWN_CARD_KEYS = new Set([
  "id",
  "kind",
  "name",
  "description",
  "preview",
  "size",
  "options",
  "document",
  "entry",
]);

const KNOWN_OPTION_KEYS = new Set([
  "key",
  "type",
  "label",
  "default",
  "maxLength",
  "min",
  "max",
  "step",
  "choices",
]);

const MAX_NODE_DEPTH = 64;

const decoder = new TextDecoder();

class Checker {
  readonly issues: CheckIssue[] = [];

  error(code: string, message: string, where?: string): void {
    this.issues.push({ severity: "error", code, message, where });
  }

  warn(code: string, message: string, where?: string): void {
    this.issues.push({ severity: "warning", code, message, where });
  }

  /** Resolve a package-relative path against the directory of `fromFile`. */
  resolveFrom(fromFile: string, reference: string): string | null {
    const segments = fromFile.split("/").slice(0, -1);
    for (const part of reference.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        if (segments.length === 0) return null;
        segments.pop();
        continue;
      }
      segments.push(part);
    }
    return segments.join("/");
  }
}

function checkColorValue(
  checker: Checker,
  value: unknown,
  where: string,
  options: { keywords?: Set<string> } = {},
): void {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const pair = value as Record<string, unknown>;
    if (typeof pair.light !== "string" || typeof pair.dark !== "string") {
      checker.error(
        "color/invalid",
        `${where}: a light/dark color pair needs both "light" and "dark" strings`,
      );
      return;
    }
    checkColorValue(checker, pair.light, `${where}.light`, options);
    checkColorValue(checker, pair.dark, `${where}.dark`, options);
    return;
  }
  if (typeof value !== "string") {
    checker.error("color/invalid", `${where}: color must be a string`);
    return;
  }
  const trimmed = value.trim();
  if (options.keywords?.has(trimmed)) return;
  if (isUnsafeCSS(trimmed)) {
    checker.error(
      "color/unsafe",
      `${where}: "${trimmed}" is not allowed (no url()/javascript:)`,
    );
    return;
  }
  if (HEX_COLOR_PATTERN.test(trimmed)) return;
  if (APP_COLOR_TOKENS.has(trimmed)) return;
  if (trimmed.startsWith("brand.")) {
    const step = trimmed.slice("brand.".length);
    if (
      !BRAND_COLOR_STEPS.includes(step as (typeof BRAND_COLOR_STEPS)[number])
    ) {
      checker.error(
        "color/unknown-token",
        `${where}: unknown brand step "${trimmed}" (expected brand.${BRAND_COLOR_STEPS.join(" / brand.")})`,
      );
    }
    return;
  }
  checker.error(
    "color/invalid",
    `${where}: unrecognized color "${trimmed}" (use #rrggbb, a light/dark pair, an app token, or brand.<step>)`,
  );
}

function checkBindings(
  checker: Checker,
  text: string,
  where: string,
  optionKeys: Set<string>,
): void {
  for (const match of text.matchAll(/\{([a-zA-Z0-9_.]+)\}/g)) {
    const token = match[1] ?? "";
    if (KNOWN_BINDINGS.has(token)) continue;
    if (token.startsWith("options.")) {
      const key = token.slice("options.".length);
      if (!optionKeys.has(key)) {
        checker.error(
          "binding/unknown-option",
          `${where}: "{${token}}" refers to an option that is not declared in this card's "options"`,
        );
      }
      continue;
    }
    checker.warn(
      "binding/unknown",
      `${where}: "{${token}}" is not a known binding and will render literally`,
    );
  }
}

function checkLocalizedText(
  checker: Checker,
  value: unknown,
  where: string,
  optionKeys: Set<string>,
): void {
  if (typeof value === "string") {
    checkBindings(checker, value, where, optionKeys);
    return;
  }
  if (isPlainObject(value)) {
    for (const [locale, text] of Object.entries(value)) {
      if (typeof text !== "string") {
        checker.error(
          "text/invalid",
          `${where}.${locale}: text values must be strings`,
        );
        continue;
      }
      checkBindings(checker, text, `${where}.${locale}`, optionKeys);
    }
    return;
  }
  checker.error(
    "text/invalid",
    `${where}: text must be a string or a locale table`,
  );
}

function checkStyle(checker: Checker, style: unknown, where: string): void {
  if (style === undefined) return;
  if (!isPlainObject(style)) {
    checker.error("style/invalid", `${where}: style must be an object`);
    return;
  }
  for (const key of Object.keys(style)) {
    if (!STYLE_KEYS.has(key)) {
      checker.warn(
        "style/unknown-key",
        `${where}.${key}: unknown style key (ignored at render time)`,
      );
    }
  }
  for (const key of ["background", "borderColor", "color"] as const) {
    if (style[key] !== undefined) {
      checkColorValue(checker, style[key], `${where}.${key}`);
    }
  }
  for (const key of ["backgroundCSS", "shadowCSS"] as const) {
    const raw = style[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string") {
      checker.error("style/invalid", `${where}.${key}: must be a string`);
    } else if (isUnsafeCSS(raw)) {
      checker.error(
        "style/unsafe",
        `${where}.${key}: url()/expression()/javascript: are not allowed`,
      );
    } else if (key === "backgroundCSS" && !/gradient\(/i.test(raw)) {
      checker.warn(
        "style/suspicious",
        `${where}.${key}: expected a CSS gradient (e.g. linear-gradient(...))`,
      );
    }
  }
  if (style.shadow !== undefined) {
    const allowed = new Set(["none", "sm", "md", "lg"]);
    if (typeof style.shadow !== "string" || !allowed.has(style.shadow)) {
      checker.error(
        "style/invalid",
        `${where}.shadow: must be one of none/sm/md/lg (use shadowCSS for a custom value)`,
      );
    }
  }
  if (style.clamp !== undefined) {
    if (typeof style.clamp !== "number" || style.clamp < 1) {
      checker.error(
        "style/invalid",
        `${where}.clamp: must be a positive number of lines`,
      );
    }
  }
  const font = style.font;
  if (font !== undefined) {
    if (!isPlainObject(font)) {
      checker.error("style/invalid", `${where}.font: must be an object`);
    } else {
      for (const key of Object.keys(font)) {
        if (!FONT_KEYS.has(key)) {
          checker.warn(
            "style/unknown-key",
            `${where}.font.${key}: unknown font key (ignored at render time)`,
          );
        }
      }
      const family = font.family;
      if (family !== undefined) {
        if (typeof family !== "string" || !BUILT_IN_FONT_FAMILIES.has(family)) {
          checker.warn(
            "font/unsupported",
            `${where}.font.family: "${String(family)}" is not a built-in family (${[...BUILT_IN_FONT_FAMILIES].join("/")}); packaged fonts are not supported yet, the card will fall back`,
          );
        }
      }
      if (font.color !== undefined) {
        checkColorValue(checker, font.color, `${where}.font.color`);
      }
    }
  }
}

function checkSvgNode(
  checker: Checker,
  node: unknown,
  where: string,
  depth: number,
): void {
  if (depth > MAX_NODE_DEPTH) {
    checker.error(
      "document/too-deep",
      `${where}: nesting exceeds ${MAX_NODE_DEPTH} levels`,
    );
    return;
  }
  if (!isPlainObject(node)) {
    checker.error("svg/invalid", `${where}: SVG node must be an object`);
    return;
  }
  const tag = node.tag;
  if (typeof tag !== "string" || !SHARE_CARD_SVG_TAGS.has(tag)) {
    checker.error(
      "svg/unknown-tag",
      `${where}.tag: "${String(tag)}" is not an allowed SVG element (allowed: ${[...SHARE_CARD_SVG_TAGS].join(", ")})`,
    );
  }
  if (node.attrs !== undefined) {
    if (!isPlainObject(node.attrs)) {
      checker.error("svg/invalid", `${where}.attrs: must be an object`);
    } else {
      for (const [name, value] of Object.entries(node.attrs)) {
        const lower = name.toLowerCase();
        if (lower.startsWith("on")) {
          checker.error(
            "svg/event-handler",
            `${where}.attrs.${name}: event handlers are not allowed`,
          );
          continue;
        }
        if (lower === "style") {
          checker.error(
            "svg/style-attr",
            `${where}.attrs.style: use per-attribute styling instead`,
          );
          continue;
        }
        if (lower === "href" || lower === "xlink:href") {
          const ok =
            typeof value === "string" &&
            (value.startsWith("#") || value.startsWith("data:image/"));
          if (!ok) {
            checker.error(
              "svg/href",
              `${where}.attrs.${name}: only "#id" references and data: images are allowed`,
            );
          }
          continue;
        }
        if (lower === "filter") {
          if (
            typeof value !== "string" ||
            !SVG_FILTER_REF_PATTERN.test(value.trim())
          ) {
            checker.error(
              "svg/filter",
              `${where}.attrs.${name}: must be "url(#filterId)"`,
            );
          }
          continue;
        }
        if (lower === "fill" || lower === "stroke" || lower === "color") {
          if (
            typeof value === "string" &&
            SVG_FILTER_REF_PATTERN.test(value.trim())
          ) {
            continue; // gradient/filter paint references
          }
          if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
          ) {
            checkColorValue(checker, value, `${where}.attrs.${name}`);
            continue;
          }
          checkColorValue(checker, value, `${where}.attrs.${name}`, {
            keywords: COLOR_KEYWORDS,
          });
          continue;
        }
        if (typeof value === "string" && isUnsafeCSS(value)) {
          checker.error(
            "svg/unsafe-value",
            `${where}.attrs.${name}: url()/expression()/javascript: are not allowed`,
          );
        }
      }
    }
  }
  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) {
      checker.error("svg/invalid", `${where}.children: must be an array`);
      return;
    }
    for (const [index, child] of node.children.entries()) {
      checkSvgNode(checker, child, `${where}.children[${index}]`, depth + 1);
    }
  }
}

function checkNode(
  checker: Checker,
  node: unknown,
  where: string,
  optionKeys: Set<string>,
  depth: number,
): void {
  if (depth > MAX_NODE_DEPTH) {
    checker.error(
      "document/too-deep",
      `${where}: nesting exceeds ${MAX_NODE_DEPTH} levels`,
    );
    return;
  }
  if (!isPlainObject(node)) {
    checker.error("document/invalid", `${where}: node must be an object`);
    return;
  }
  const type = node.type;
  if (typeof type !== "string" || !NODE_TYPES.has(type)) {
    checker.error(
      "card/unknown-node",
      `${where}.type: unknown node type "${String(type)}" (expected: ${[...NODE_TYPES].join(", ")})`,
    );
    return;
  }
  checkStyle(checker, node.style, `${where}.style`);

  switch (type) {
    case "row":
    case "column": {
      if (node.children !== undefined && !Array.isArray(node.children)) {
        checker.error(
          "document/invalid",
          `${where}.children: must be an array`,
        );
        break;
      }
      for (const [index, child] of (
        node.children as unknown[] | undefined
      )?.entries() ?? []) {
        checkNode(
          checker,
          child,
          `${where}.children[${index}]`,
          optionKeys,
          depth + 1,
        );
      }
      break;
    }
    case "text": {
      if (node.text === undefined) {
        checker.error("document/invalid", `${where}.text: is required`);
        break;
      }
      checkLocalizedText(checker, node.text, `${where}.text`, optionKeys);
      break;
    }
    case "image": {
      const src = node.src;
      if (typeof src !== "string" || src.trim().length === 0) {
        checker.error("document/invalid", `${where}.src: is required`);
        break;
      }
      checkBindings(checker, src, `${where}.src`, optionKeys);
      const resolved = src.replace(/\{[a-zA-Z0-9_.]+\}/g, "");
      if (/^https?:|^\/\//i.test(src.trim())) {
        checker.error(
          "image/external",
          `${where}.src: external images are not allowed — inline the image as a data: URI`,
        );
      } else if (
        resolved.trim().length > 0 &&
        !src.startsWith("data:image/") &&
        !src.startsWith("blob:")
      ) {
        checker.warn(
          "image/relative",
          `${where}.src: relative file paths are not resolved for document cards yet — inline the image as a data: URI`,
        );
      }
      break;
    }
    case "svg": {
      if (typeof node.viewBox !== "string" || !/\d/.test(node.viewBox)) {
        checker.error(
          "document/invalid",
          `${where}.viewBox: is required (e.g. "0 0 340 210")`,
        );
      }
      for (const [index, child] of (
        node.children as SvgNode[] | undefined
      )?.entries() ?? []) {
        checkSvgNode(checker, child, `${where}.children[${index}]`, depth + 1);
      }
      break;
    }
    default:
      break;
  }
}

function checkPreview(
  checker: Checker,
  bytes: Uint8Array,
  where: string,
): void {
  if (bytes.byteLength > PLUGIN_PACKAGE_LIMITS.maxPreviewBytes) {
    checker.error(
      "preview/too-large",
      `${where}: preview is ${Math.round(bytes.byteLength / 1024)}KB (limit ${PLUGIN_PACKAGE_LIMITS.maxPreviewBytes / 1024}KB)`,
    );
  }
  const isPng =
    bytes.byteLength > 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  if (!isPng) {
    checker.error("preview/not-png", `${where}: preview must be a PNG file`);
    return;
  }
  // PNG stores dimensions big-endian at a fixed offset (IHDR width/height).
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width < 200 || height < 200) {
    checker.warn(
      "preview/small",
      `${where}: preview is ${width}×${height}px — at least 200px per side reads better in the store`,
    );
  }
}

/** Dangerous attribute names whose values must stay inside the package. */
const RESOURCE_ATTR_PATTERN =
  /\b(src|href|srcset|poster|data|action|formaction|background)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const TAG_PATTERN =
  /<(script|link|iframe|object|embed|img|source|video|audio)\b[^>]*>/gi;
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

function checkSandbox(
  checker: Checker,
  html: string,
  entryPath: string,
  files: Record<string, Uint8Array>,
): void {
  const pushReference = (raw: string, where: string): void => {
    const value = raw.trim();
    if (!value) return;
    if (
      value.startsWith("data:") ||
      value.startsWith("blob:") ||
      value.startsWith("#")
    ) {
      return;
    }
    if (/^https?:|^\/\//i.test(value)) {
      checker.error(
        "sandbox/external-url",
        `${where}: "${value}" loads from the network — the sandbox blocks it, so inline the resource (data: URI)`,
      );
      return;
    }
    if (value.startsWith("/")) {
      checker.error(
        "sandbox/absolute-path",
        `${where}: "${value}" is an absolute path and cannot resolve inside the sandbox — inline the resource or use a path relative to this file`,
      );
      return;
    }
    const resolved = checker.resolveFrom(entryPath, value);
    if (!resolved) {
      checker.error(
        "sandbox/escapes-package",
        `${where}: "${value}" points outside the plugin folder`,
      );
      return;
    }
    if (!files[resolved]) {
      checker.error(
        "sandbox/missing-asset",
        `${where}: "${value}" does not exist in the package (expected ${resolved})`,
      );
    }
  };

  if (/<base\b/i.test(html)) {
    checker.error(
      "sandbox/base-tag",
      `${entryPath}: <base> is not allowed inside plugin entries`,
    );
  }

  for (const tagMatch of html.matchAll(TAG_PATTERN)) {
    const tagText = tagMatch[0];
    const tagName = (tagMatch[1] ?? "").toLowerCase();
    if (tagName === "script" && /\bsrc\s*=/i.test(tagText)) {
      checker.error(
        "sandbox/external-script",
        `${entryPath}: <script src=…> cannot load in the sandbox — use an inline <script>`,
      );
      continue;
    }
    if (tagName === "link" && /\brel\s*=\s*["']?stylesheet/i.test(tagText)) {
      checker.error(
        "sandbox/external-style",
        `${entryPath}: external stylesheets cannot load in the sandbox — use an inline <style>`,
      );
      continue;
    }
    if (tagName === "iframe" || tagName === "object" || tagName === "embed") {
      checker.error(
        "sandbox/nested-frame",
        `${entryPath}: <${tagName}> is not allowed inside plugin entries`,
      );
      continue;
    }
    for (const attrMatch of tagText.matchAll(RESOURCE_ATTR_PATTERN)) {
      const attrName = (attrMatch[1] ?? "").toLowerCase();
      const value = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? "";
      if (attrName === "srcset") {
        for (const candidate of value.split(",")) {
          const url = candidate.trim().split(/\s+/)[0];
          if (url) pushReference(url, `${entryPath}: srcset`);
        }
        continue;
      }
      pushReference(value, `${entryPath}: ${attrName}`);
    }
  }

  if (/@import\s/i.test(html)) {
    checker.error(
      "sandbox/css-import",
      `${entryPath}: @import is not allowed — use an inline <style>`,
    );
  }
  for (const urlMatch of html.matchAll(CSS_URL_PATTERN)) {
    const value = (urlMatch[2] ?? "").trim();
    if (value.startsWith("#")) continue; // SVG paint references
    pushReference(value, `${entryPath}: css url()`);
  }
}

function checkCard(
  checker: Checker,
  card: ShareCardContribution,
  rawCard: unknown,
  files: Record<string, Uint8Array>,
): void {
  const where = `card "${card.id}"`;
  if (isPlainObject(rawCard)) {
    for (const key of Object.keys(rawCard)) {
      if (!KNOWN_CARD_KEYS.has(key)) {
        checker.warn(
          "manifest/unknown-field",
          `${where}: field "${key}" is not part of the spec and is ignored`,
        );
      }
    }
    if (card.kind === "document" && rawCard.entry !== undefined) {
      checker.warn(
        "manifest/extra-field",
        `${where}: "entry" is only used by sandbox cards`,
      );
    }
    if (card.kind === "sandbox" && rawCard.document !== undefined) {
      checker.warn(
        "manifest/extra-field",
        `${where}: "document" is only used by document cards`,
      );
    }
    if (Array.isArray(rawCard.options)) {
      for (const option of rawCard.options) {
        if (!isPlainObject(option)) continue;
        for (const key of Object.keys(option)) {
          if (!KNOWN_OPTION_KEYS.has(key)) {
            checker.warn(
              "manifest/unknown-field",
              `${where}: option "${String(option.key)}" has unknown field "${key}" (ignored)`,
            );
          }
        }
      }
    }
  }

  const optionKeys = new Set((card.options ?? []).map((option) => option.key));

  if (card.preview) {
    const previewBytes = files[card.preview];
    if (!previewBytes) {
      checker.error(
        "card/missing-file",
        `${where}: references a missing file (preview): ${card.preview}`,
      );
    } else {
      checkPreview(checker, previewBytes, `${card.preview}`);
    }
  }

  if (card.kind === "document") {
    const documentPath = card.document ?? "";
    const bytes = files[documentPath];
    if (!bytes) {
      checker.error(
        "card/missing-file",
        `${where}: references a missing file: ${documentPath}`,
      );
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoder.decode(bytes));
    } catch {
      checker.error("card/invalid-json", `${documentPath}: is not valid JSON`);
      return;
    }
    if (!isPlainObject(parsed)) {
      checker.error(
        "card/invalid",
        `${documentPath}: document must be an object`,
      );
      return;
    }
    if (parsed.specVersion !== SHARE_CARD_SPEC_VERSION) {
      checker.error(
        "card/spec-version",
        `${documentPath}: specVersion must be ${SHARE_CARD_SPEC_VERSION}`,
      );
    }
    if (parsed.root === undefined) {
      checker.error("card/invalid", `${documentPath}: "root" is required`);
      return;
    }
    checkNode(checker, parsed.root, `${documentPath} · root`, optionKeys, 0);
    return;
  }

  const entryPath = card.entry ?? "";
  const bytes = files[entryPath];
  if (!bytes) {
    checker.error(
      "card/missing-file",
      `${where}: references a missing file: ${entryPath}`,
    );
    return;
  }
  checkSandbox(checker, decoder.decode(bytes), entryPath, files);
}

/** Validate a full package (manifest + cards + assets). Pure; never throws. */
export function checkPluginFiles(input: PluginCheckInput): PluginCheckResult {
  const checker = new Checker();
  const { files } = input;

  const manifestBytes = files["plugin.json"];
  if (!manifestBytes) {
    checker.error(
      "manifest/missing",
      "plugin.json is missing at the package root",
    );
    return {
      pluginId: null,
      version: null,
      manifest: null,
      issues: checker.issues,
      ok: false,
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(manifestBytes));
  } catch {
    checker.error("manifest/invalid-json", "plugin.json is not valid JSON");
    return {
      pluginId: null,
      version: null,
      manifest: null,
      issues: checker.issues,
      ok: false,
    };
  }
  if (isPlainObject(raw)) {
    for (const key of Object.keys(raw)) {
      if (!KNOWN_MANIFEST_KEYS.has(key)) {
        checker.warn(
          "manifest/unknown-field",
          `plugin.json: field "${key}" is not part of the spec and is ignored`,
        );
      }
    }
    if (isPlainObject(raw.contributes)) {
      for (const key of Object.keys(raw.contributes)) {
        if (key !== "shareCardTemplates") {
          checker.warn(
            "manifest/unknown-field",
            `plugin.json: contributes."${key}" is not a known slot and is ignored`,
          );
        }
      }
    }
  }

  const { manifest, problems } = validatePluginManifest(raw);
  for (const problem of problems) {
    checker.error("manifest/invalid", `plugin.json: ${problem}`);
  }
  if (!manifest) {
    return {
      pluginId: null,
      version: null,
      manifest: null,
      issues: checker.issues,
      ok: false,
    };
  }

  if (input.rootFolder && input.rootFolder !== manifest.id) {
    checker.error(
      "manifest/id-mismatch",
      `plugin.json: id "${manifest.id}" must match the package folder "${input.rootFolder}"`,
    );
  }
  if (input.tier === "community") {
    if (!manifest.author?.name) {
      checker.error(
        "manifest/missing-author",
        "plugin.json: community plugins must declare an author",
      );
    }
    if (!manifest.license) {
      checker.warn(
        "manifest/missing-license",
        "plugin.json: no license declared — it is treated as AGPL-3.0-only",
      );
    }
  }

  const rawCards =
    isPlainObject(raw) &&
    isPlainObject(raw.contributes) &&
    Array.isArray(raw.contributes.shareCardTemplates)
      ? (raw.contributes.shareCardTemplates as unknown[])
      : [];
  (manifest.contributes.shareCardTemplates ?? []).forEach((card, index) => {
    checkCard(checker, card, rawCards[index], files);
  });

  if (files["preview.png"]) {
    checkPreview(checker, files["preview.png"], "preview.png");
  }

  let fontCount = 0;
  for (const [name, bytes] of Object.entries(files)) {
    if (!/\.(woff2?|ttf|otf)$/i.test(name)) continue;
    fontCount += 1;
    if (bytes.byteLength > PLUGIN_PACKAGE_LIMITS.maxFontBytes) {
      checker.error(
        "asset/font-too-large",
        `${name}: fonts must stay under ${PLUGIN_PACKAGE_LIMITS.maxFontBytes / 1024}KB`,
      );
    }
    if (!/\.woff2$/i.test(name)) {
      checker.warn("asset/font-format", `${name}: prefer woff2 (smaller)`);
    }
  }
  if (fontCount > PLUGIN_PACKAGE_LIMITS.maxFonts) {
    checker.error(
      "asset/too-many-fonts",
      `package contains ${fontCount} font files (limit ${PLUGIN_PACKAGE_LIMITS.maxFonts})`,
    );
  }

  return {
    pluginId: manifest.id,
    version: manifest.version,
    manifest,
    issues: checker.issues,
    ok: !checker.issues.some((issue) => issue.severity === "error"),
  };
}

/** Convenience: `{ ok, errors, warnings }` counts for CLI summaries. */
export function summarizeCheckResult(result: PluginCheckResult): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const issue of result.issues) {
    if (issue.severity === "error") errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}
