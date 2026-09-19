import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { useEffect, useState } from "react";
import type { HighlighterCore } from "shiki/core";
import type { Pluggable } from "unified";

type LooseHighlighter = Parameters<typeof rehypeShikiFromHighlighter>[0];

import { LazyMemoContent } from "@/components/lazy-memo-content";
import {
  getWebHighlighter,
  preloadWebCodeLanguages,
} from "@/lib/web-highlighter";

/**
 * The rehype plugin entry for the article preview. `rehypeShikiFromHighlighter`
 * is a *factory*: unified must call it as an attacher with the highlighter and
 * options as arguments, so the plugin entry is the tuple
 * `[factory, highlighter, options]` — passing the already-called result as the
 * entry makes unified invoke the transformer as an attacher (no tree), which
 * throws inside unist-util-visit during freeze.
 */
export function buildShikiRehypePlugins(
  highlighter: HighlighterCore,
): Pluggable[] {
  // Cast: react-markdown's bundled unified version types Pluggable slightly
  // narrower than @shikijs/rehype's transformer return.
  return [
    [
      rehypeShikiFromHighlighter,
      highlighter as LooseHighlighter,
      {
        themes: { light: "github-light", dark: "github-dark" },
        defaultColor: false,
        fallbackLanguage: "plain",
      },
    ] as unknown as Pluggable,
  ];
}

/**
 * Article preview body with client-side Shiki highlighting. Mirrors the SSR
 * article page (same themes via CSS variables), but the highlighter loads
 * lazily and a failure degrades to the plain markdown view.
 */
export function ArticleShikiBody({ content }: { content: string }) {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await preloadWebCodeLanguages(content);
        const loaded = await getWebHighlighter();
        if (alive) setHighlighter(loaded);
      } catch {
        // Highlighting stays off; the preview still renders.
      }
    })();
    return () => {
      alive = false;
    };
  }, [content]);

  if (!highlighter) {
    return <LazyMemoContent content={content} withHeadingIds />;
  }
  return (
    <LazyMemoContent
      content={content}
      rehypePlugins={buildShikiRehypePlugins(highlighter)}
      withHeadingIds
    />
  );
}
