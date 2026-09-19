/**
 * Share-card document model (spec version 1) and its pure resolution helpers.
 *
 * A document is data, not code: the web renderer maps it onto DOM nodes and
 * lets the browser do the layout. Colors may reference brand tokens
 * (`"brand.500"`) so a card follows the instance accent, or carry explicit
 * light/dark variants so one document works in both themes.
 */

import type {
  LocalizedText,
  ShareCardOptionSpec,
  ShareCardOptionValue,
} from "./spec";

export const SHARE_CARD_SPEC_VERSION = 1;

export type DocumentMode = "light" | "dark";

/** `"#aabbcc"` | `"brand.500"` | `"foreground"` | `{ light, dark }`. */
export type DocumentColor = string | { light: string; dark: string };

export type DocumentFontFamily = "sans" | "heading" | "serif" | "mono";

export type DocumentFont = {
  family?: DocumentFontFamily;
  /** px */
  size?: number;
  weight?: number;
  /** Unitless multiplier or a CSS length passed through. */
  lineHeight?: number | string;
  /** px */
  letterSpacing?: number;
  align?: "start" | "center" | "end";
  uppercase?: boolean;
  color?: DocumentColor;
};

export type DocumentStyle = {
  background?: DocumentColor;
  /** Raw CSS background (gradients for textures/barcodes); `url()` rejected. */
  backgroundCSS?: string;
  opacity?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: DocumentColor;
  borderTopWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;
  borderRightWidth?: number;
  borderStyle?: "solid" | "dashed";
  shadow?: "none" | "sm" | "md" | "lg";
  /** Raw CSS box-shadow for fidelity beyond the presets; unsafe values rejected. */
  shadowCSS?: string;
  /** px */
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  /** Sets the CSS `color` property (text color / `currentColor` source). */
  color?: DocumentColor;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  gap?: number;
  width?: number | string;
  height?: number | string;
  /** Flex grow/shrink weight inside a row/column. */
  flex?: number;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "space-between";
  position?: "relative" | "absolute";
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  overflow?: "visible" | "hidden";
  /** Line clamp for text nodes. */
  clamp?: number;
  /** Degrees. */
  rotate?: number;
  font?: DocumentFont;
};

export type SvgAttrValue = string | number | DocumentColor;

export type SvgNode = {
  tag: string;
  attrs?: Record<string, SvgAttrValue>;
  children?: SvgNode[];
};

export type DocumentNode =
  | { type: "row" | "column"; children?: DocumentNode[]; style?: DocumentStyle }
  | { type: "text"; text: LocalizedText | string; style?: DocumentStyle }
  | { type: "image"; src: string; alt?: string; style?: DocumentStyle }
  | {
      type: "svg";
      viewBox: string;
      children?: SvgNode[];
      style?: DocumentStyle;
    }
  | { type: "divider"; style?: DocumentStyle }
  | { type: "spacer"; style?: DocumentStyle };

export type ShareCardDocument = {
  specVersion: number;
  root: DocumentNode;
};

/** SVG elements a document may use; anything else is skipped at render time. */
export const SHARE_CARD_SVG_TAGS = new Set([
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "g",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "filter",
  "feTurbulence",
  "feDisplacementMap",
  "feGaussianBlur",
  "feColorMatrix",
  "feBlend",
  "feMerge",
  "feMergeNode",
  "feOffset",
  "title",
]);

export const BRAND_COLOR_STEPS = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "coral",
] as const;

const APP_COLOR_TOKENS: Record<string, string> = {
  foreground: "var(--foreground)",
  background: "var(--background)",
  card: "var(--card)",
  muted: "var(--muted-foreground)",
  border: "var(--border)",
};

export type ShareCardData = {
  body: string;
  date: string;
  day: string;
  stats: string;
  locale: string;
  brand: {
    product: string;
    markLight: string | null;
    markDark: string | null;
  };
};

export type ShareCardRenderContext = {
  data: ShareCardData;
  options: Record<string, ShareCardOptionValue>;
  mode: DocumentMode;
};

/** Resolve a locale table: exact match → base language → en-US → first entry. */
export function resolveLocalizedText(
  value: LocalizedText | string,
  locale: string,
): string {
  if (typeof value === "string") return value;
  const exact = value[locale];
  if (typeof exact === "string") return exact;
  const base = locale.split("-")[0]?.toLowerCase();
  if (base) {
    for (const [key, text] of Object.entries(value)) {
      if (key.split("-")[0]?.toLowerCase() === base) return text;
    }
  }
  return value["en-US"] ?? Object.values(value)[0] ?? "";
}

/** CSS that could reach the network or script engines; rejected everywhere. */
export function isUnsafeCSS(value: string): boolean {
  return /url\s*\(|expression\s*\(|javascript:/i.test(value);
}

export function resolveColor(
  color: DocumentColor | undefined,
  mode: DocumentMode,
): string | undefined {
  if (color === undefined) return undefined;
  const raw =
    typeof color === "string"
      ? color
      : mode === "dark"
        ? color.dark
        : color.light;
  const trimmed = raw.trim();
  if (!trimmed || isUnsafeCSS(trimmed)) return undefined;
  if (trimmed.startsWith("brand.")) {
    const step = trimmed.slice("brand.".length);
    if (
      BRAND_COLOR_STEPS.includes(step as (typeof BRAND_COLOR_STEPS)[number])
    ) {
      return step === "coral" ? "var(--brand-coral)" : `var(--brand-${step})`;
    }
    return undefined;
  }
  const token = APP_COLOR_TOKENS[trimmed];
  if (token) return token;
  return trimmed;
}

export function resolveBackgroundCSS(
  css: string | undefined,
): string | undefined {
  if (!css || isUnsafeCSS(css)) return undefined;
  return css;
}

function lookupBinding(
  token: string,
  ctx: ShareCardRenderContext,
): string | undefined {
  switch (token) {
    case "body":
      return ctx.data.body;
    case "date":
      return ctx.data.date;
    case "day":
      return ctx.data.day;
    case "day.padded":
      return ctx.data.day ? ctx.data.day.padStart(2, "0") : "";
    case "stats":
      return ctx.data.stats;
    case "locale":
      return ctx.data.locale;
    case "brand.product":
      return ctx.data.brand.product;
    case "brand.markLight":
      return ctx.data.brand.markLight ?? "";
    case "brand.markDark":
      return ctx.data.brand.markDark ?? "";
    default: {
      if (!token.startsWith("options.")) return undefined;
      const value = ctx.options[token.slice("options.".length)];
      return value === undefined ? undefined : String(value);
    }
  }
}

/** Replace `{body}`-style bindings; unknown tokens are left untouched. */
export function applyBindings(
  template: string,
  ctx: ShareCardRenderContext,
): string {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (match, token: string) => {
    const value = lookupBinding(token, ctx);
    return value === undefined ? match : value;
  });
}

/** Merge contribution option defaults with the instance's configured values. */
export function resolveOptionValues(
  specs: ShareCardOptionSpec[] | undefined,
  configured: Record<string, ShareCardOptionValue> | undefined,
): Record<string, ShareCardOptionValue> {
  const values: Record<string, ShareCardOptionValue> = {};
  for (const spec of specs ?? []) {
    if (spec.default !== undefined) values[spec.key] = spec.default;
  }
  for (const [key, value] of Object.entries(configured ?? {})) {
    const spec = (specs ?? []).find((candidate) => candidate.key === key);
    if (!spec) continue;
    if (spec.type === "boolean" && typeof value === "boolean") {
      values[key] = value;
    } else if (spec.type === "text" && typeof value === "string") {
      values[key] = value.slice(0, spec.maxLength ?? 500);
    } else if (spec.type === "color" && typeof value === "string") {
      values[key] = value;
    } else if (spec.type === "number" && typeof value === "number") {
      values[key] = value;
    } else if (
      spec.type === "enum" &&
      typeof value === "string" &&
      spec.choices.some((choice) => choice.value === value)
    ) {
      values[key] = value;
    }
  }
  return values;
}
