import {
  applyBindings,
  type DocumentColor,
  type DocumentNode,
  type DocumentStyle,
  isUnsafeCSS,
  resolveBackgroundCSS,
  resolveColor,
  resolveLocalizedText,
  SHARE_CARD_SVG_TAGS,
  type ShareCardDocument,
  type ShareCardRenderContext,
  type SvgNode,
} from "@flaremo/plugins";
import type { CSSProperties, ElementType, ReactNode } from "react";

/**
 * Renders a share-card document (data, not code) into DOM. Every style field
 * maps onto inline CSS so the browser handles layout, and colors resolve
 * against the live theme (`brand.*` tokens follow the instance accent).
 * Unknown nodes and unsafe values are skipped rather than rendered.
 */

/** Maps the plugin-facing DocumentFontFamily onto the app's token tiers, so a
 *  card inherits the same language-scoped stacks the UI uses. */
const FONT_STACKS: Record<string, string> = {
  sans: "var(--font-sans)",
  heading: "var(--font-heading)",
  mono: "var(--font-mono)",
  serif: "var(--font-serif)",
};

const SHADOWS: Record<string, string> = {
  none: "none",
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
};

const ALIGN_ITEMS: Record<string, CSSProperties["alignItems"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
};

const JUSTIFY_CONTENT: Record<string, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  "space-between": "space-between",
};

const TEXT_ALIGN: Record<string, CSSProperties["textAlign"]> = {
  start: "left",
  center: "center",
  end: "right",
};

/** Only same-origin, data:, and blob: images may render: no network fetches. */
export function isSafeImageSource(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed || isUnsafeCSS(trimmed)) return false;
  return (
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/")
  );
}

function styleToCSS(
  style: DocumentStyle | undefined,
  mode: "light" | "dark",
): CSSProperties {
  const css: CSSProperties = {};
  if (!style) return css;

  const background = resolveColor(style.background, mode);
  if (background) css.background = background;
  const backgroundCSS = resolveBackgroundCSS(style.backgroundCSS);
  if (backgroundCSS) css.backgroundImage = backgroundCSS;
  const color = resolveColor(style.color, mode);
  if (color) css.color = color;

  if (style.opacity !== undefined) css.opacity = style.opacity;
  if (style.borderRadius !== undefined) css.borderRadius = style.borderRadius;
  if (style.shadow) css.boxShadow = SHADOWS[style.shadow];
  if (style.shadowCSS && !isUnsafeCSS(style.shadowCSS)) {
    css.boxShadow = style.shadowCSS;
  }

  const borderColor = resolveColor(style.borderColor, mode);
  const borderStyle = style.borderStyle ?? "solid";
  if (style.borderWidth !== undefined) {
    css.borderWidth = style.borderWidth;
    css.borderStyle = borderStyle;
  }
  if (
    borderColor &&
    (style.borderWidth !== undefined ||
      style.borderTopWidth !== undefined ||
      style.borderBottomWidth !== undefined ||
      style.borderLeftWidth !== undefined ||
      style.borderRightWidth !== undefined)
  ) {
    css.borderColor = borderColor;
  }
  if (style.borderTopWidth !== undefined) {
    css.borderTopWidth = style.borderTopWidth;
    css.borderTopStyle = borderStyle;
  }
  if (style.borderBottomWidth !== undefined) {
    css.borderBottomWidth = style.borderBottomWidth;
    css.borderBottomStyle = borderStyle;
  }
  if (style.borderLeftWidth !== undefined) {
    css.borderLeftWidth = style.borderLeftWidth;
    css.borderLeftStyle = borderStyle;
  }
  if (style.borderRightWidth !== undefined) {
    css.borderRightWidth = style.borderRightWidth;
    css.borderRightStyle = borderStyle;
  }

  if (style.padding !== undefined) css.padding = style.padding;
  if (style.paddingX !== undefined) {
    css.paddingLeft = style.paddingX;
    css.paddingRight = style.paddingX;
  }
  if (style.paddingY !== undefined) {
    css.paddingTop = style.paddingY;
    css.paddingBottom = style.paddingY;
  }
  // Per-side values win over the shorthand/axis forms, matching CSS order.
  if (style.paddingTop !== undefined) css.paddingTop = style.paddingTop;
  if (style.paddingBottom !== undefined)
    css.paddingBottom = style.paddingBottom;
  if (style.paddingLeft !== undefined) css.paddingLeft = style.paddingLeft;
  if (style.paddingRight !== undefined) css.paddingRight = style.paddingRight;
  if (style.marginTop !== undefined) css.marginTop = style.marginTop;
  if (style.marginRight !== undefined) css.marginRight = style.marginRight;
  if (style.marginBottom !== undefined) css.marginBottom = style.marginBottom;
  if (style.marginLeft !== undefined) css.marginLeft = style.marginLeft;

  if (style.gap !== undefined) css.gap = style.gap;
  if (style.width !== undefined) css.width = style.width;
  if (style.height !== undefined) css.height = style.height;
  if (style.flex !== undefined) {
    css.flexGrow = style.flex;
    css.flexShrink = 1;
    css.flexBasis = 0;
    css.minHeight = 0;
  }
  if (style.align) css.alignItems = ALIGN_ITEMS[style.align];
  if (style.justify) css.justifyContent = JUSTIFY_CONTENT[style.justify];
  if (style.position) css.position = style.position;
  if (style.top !== undefined) css.top = style.top;
  if (style.right !== undefined) css.right = style.right;
  if (style.bottom !== undefined) css.bottom = style.bottom;
  if (style.left !== undefined) css.left = style.left;
  if (style.overflow) css.overflow = style.overflow;
  if (style.rotate !== undefined) css.transform = `rotate(${style.rotate}deg)`;

  const font = style.font;
  if (font) {
    if (font.family) css.fontFamily = FONT_STACKS[font.family];
    if (font.size !== undefined) css.fontSize = font.size;
    if (font.weight !== undefined) css.fontWeight = font.weight;
    if (font.lineHeight !== undefined) css.lineHeight = font.lineHeight;
    if (font.letterSpacing !== undefined)
      css.letterSpacing = font.letterSpacing;
    if (font.align) css.textAlign = TEXT_ALIGN[font.align];
    if (font.uppercase) css.textTransform = "uppercase";
    const fontColor = resolveColor(font.color, mode);
    if (fontColor) css.color = fontColor;
  }

  if (style.clamp !== undefined) {
    css.display = "-webkit-box";
    css.WebkitLineClamp = style.clamp;
    css.WebkitBoxOrient = "vertical";
    css.overflow = "hidden";
  }

  return css;
}

function renderSvgNode(
  node: SvgNode,
  mode: "light" | "dark",
  key: number,
): ReactNode {
  if (!SHARE_CARD_SVG_TAGS.has(node.tag)) return null;
  const attrs: Record<string, string | number> = {};
  for (const [name, raw] of Object.entries(node.attrs ?? {})) {
    const lower = name.toLowerCase();
    if (lower.startsWith("on") || lower === "style") continue;
    if (lower === "href" || lower === "xlink:href") {
      if (
        typeof raw === "string" &&
        (raw.startsWith("#") || raw.startsWith("data:image/"))
      ) {
        attrs[name] = raw;
      }
      continue;
    }
    if (typeof raw === "number") {
      attrs[name] = raw;
      continue;
    }
    if (typeof raw === "string") {
      if (isUnsafeCSS(raw) && !/^url\(#[a-zA-Z0-9_-]+\)$/.test(raw.trim()))
        continue;
      attrs[name] = raw;
      continue;
    }
    const resolved = resolveColor(raw as DocumentColor, mode);
    if (resolved) attrs[name] = resolved;
  }
  const children = (node.children ?? [])
    .map((child, index) => renderSvgNode(child, mode, index))
    .filter((child) => child !== null);
  const Tag = node.tag as unknown as ElementType;
  return (
    <Tag key={key} {...attrs}>
      {children}
    </Tag>
  );
}

function renderNode(
  node: DocumentNode,
  ctx: ShareCardRenderContext,
  mode: "light" | "dark",
  key: number,
): ReactNode {
  switch (node.type) {
    case "row":
    case "column": {
      const css = styleToCSS(node.style, mode);
      return (
        <div
          key={key}
          style={{
            display: "flex",
            flexDirection: node.type === "row" ? "row" : "column",
            position: "relative",
            minWidth: 0,
            ...css,
          }}
        >
          {(node.children ?? []).map((child, index) =>
            renderNode(child, ctx, mode, index),
          )}
        </div>
      );
    }
    case "text": {
      const content = applyBindings(
        resolveLocalizedText(node.text, ctx.data.locale),
        ctx,
      );
      if (!content) return null;
      return (
        <div
          key={key}
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            minWidth: 0,
            ...styleToCSS(node.style, mode),
          }}
        >
          {content}
        </div>
      );
    }
    case "image": {
      const src = applyBindings(node.src, ctx);
      if (!isSafeImageSource(src)) return null;
      return (
        <img
          alt={node.alt ?? ""}
          key={key}
          src={src}
          style={{
            display: "block",
            maxWidth: "100%",
            ...styleToCSS(node.style, mode),
          }}
        />
      );
    }
    case "svg": {
      const css = styleToCSS(node.style, mode);
      return (
        <svg
          aria-hidden="true"
          key={key}
          preserveAspectRatio="none"
          style={{ display: "block", ...css }}
          viewBox={node.viewBox}
        >
          {(node.children ?? []).map((child, index) =>
            renderSvgNode(child, mode, index),
          )}
        </svg>
      );
    }
    case "divider": {
      const css = styleToCSS(node.style, mode);
      return (
        <div
          key={key}
          style={{
            height: 0,
            borderTopWidth: 1,
            borderTopStyle: "solid",
            borderColor:
              resolveColor(node.style?.color, mode) ?? "currentColor",
            opacity: node.style?.opacity ?? 0.4,
            ...css,
          }}
        />
      );
    }
    case "spacer":
      return (
        <div
          aria-hidden="true"
          key={key}
          style={styleToCSS(node.style, mode)}
        />
      );
    default:
      return null;
  }
}

export function ShareCardDocumentView({
  document,
  width,
  height,
  context,
  mode,
}: {
  document: ShareCardDocument;
  width: number;
  height: number;
  context: ShareCardRenderContext;
  mode: "light" | "dark";
}) {
  return (
    <div style={{ width, height, overflow: "hidden" }}>
      {renderNode(document.root, context, mode, 0)}
    </div>
  );
}
