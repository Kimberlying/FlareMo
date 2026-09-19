// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { buildShikiRehypePlugins } from "@/components/article-shiki-body";
import {
  getWebHighlighter,
  preloadWebCodeLanguages,
} from "@/lib/web-highlighter";

/**
 * Regression guard for the article preview's Shiki wiring. The original
 * implementation passed the *called* `rehypeShikiFromHighlighter(...)` result
 * as the plugin entry, which unified invokes as an attacher with no tree —
 * throwing inside unist-util-visit on every preview render.
 */
describe("web article preview highlighting", () => {
  const render = async (content: string) => {
    await preloadWebCodeLanguages(content);
    const highlighter = await getWebHighlighter();
    return renderToStaticMarkup(
      <Markdown
        rehypePlugins={buildShikiRehypePlugins(highlighter)}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </Markdown>,
    );
  };

  it("renders shiki-highlighted code through react-markdown", async () => {
    const html = await render("```ts\nconst a: number = 1;\n```");
    expect(html).toContain('class="shiki');
    expect(html).toContain("--shiki-light");
  });

  it("renders unsupported languages via the plain fallback without crashing", async () => {
    const html = await render("```cobol\nMOVE X TO Y\n```");
    expect(html).toContain("MOVE X TO Y");
  });

  it("renders prose without code fences untouched", async () => {
    const html = await render("# 标题\n\n普通段落。");
    expect(html).toContain("<h1>标题</h1>");
  });
});
