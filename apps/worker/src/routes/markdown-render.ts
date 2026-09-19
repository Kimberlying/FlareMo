import { Marked, type Tokens } from "marked";

/**
 * Shared sanitized markdown pipeline for the server-rendered public pages
 * (memo share page + article page). Raw HTML blocks/inline are dropped like
 * react-markdown does; javascript:/data: destinations are neutralized; body
 * images get intrinsic dimensions from attachment payloads. This is security
 * logic validated by the share-page parity tests — both routes must render
 * through it.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url);
}

export type SanitizedMarkedOptions = {
  /** Attachment id (prefix stripped) → intrinsic image dimensions. */
  dimensionsByAttachmentId?: Map<string, { width: number; height: number }>;
};

/**
 * Matches the attachment id in either body-image URL shape: the
 * authenticated `/file/attachments/<id>` reference the markdown stores, or
 * the anonymous public blob URL the SSR pages rewrite to.
 */
export function attachmentIdFromHref(href: string): string | undefined {
  return /(?:\/file|\/api\/public\/(?:shares\/[^/]+|articles\/[^/]+))\/attachments\/([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(
    href,
  )?.[1];
}

export function createSanitizedMarked(
  options: Partial<SanitizedMarkedOptions> = {},
) {
  const { dimensionsByAttachmentId } = options;
  const marked = new Marked({ gfm: true });
  marked.use({
    async: false,
    walkTokens(token) {
      if (
        (token.type === "link" || token.type === "image") &&
        !isSafeUrl(token.href)
      ) {
        token.href = "#blocked";
      }
    },
    renderer: {
      html() {
        return "";
      },
      image(token: Tokens.Image) {
        const alt = escapeHtml(token.text ?? "");
        const src = escapeHtml(token.href);
        const attachmentId = attachmentIdFromHref(token.href);
        const dimensions = attachmentId
          ? dimensionsByAttachmentId?.get(attachmentId)
          : undefined;
        const sizeAttributes = dimensions
          ? ` width="${dimensions.width}" height="${dimensions.height}"`
          : ' loading="lazy" decoding="async"';
        return `<img src="${src}" alt="${alt}"${sizeAttributes} />`;
      },
    },
  });
  return marked;
}

export function attachmentImageDimensions(
  payload: Record<string, unknown> | null,
): { width: number; height: number } | undefined {
  const width = payload?.width;
  const height = payload?.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  return { width, height };
}

/**
 * Flatten markdown-ish content into plain text for description / structured
 * data. Enough to strip syntax noise from headings, emphasis, links, and
 * code; not a full renderer.
 */
export function contentToPlainText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>+\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}
