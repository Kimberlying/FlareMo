// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { buildArticleExtensions } from "./article-editor";

/**
 * Markdown round-trip idempotence for the article editor whitelist. Storage is
 * plain GFM text shared with the memo composer, so the same hard requirement
 * applies: whatever the editor serializes must re-parse to itself. Unlike the
 * composer, articles may carry tables and level-4 headings — those extensions
 * are the delta this suite pins down.
 */
describe("article markdown round-trip", () => {
  const editor = new Editor({
    extensions: buildArticleExtensions(""),
    content: "",
    contentType: "markdown",
  });

  const round = (markdown: string) => {
    editor.commands.setContent(markdown, { contentType: "markdown" });
    return editor.getMarkdown();
  };

  const samples: string[] = [
    "| 列A | 列B |\n| --- | --- |\n| 1 | 2 |",
    "```python\nprint(1)\n```",
    "# A\n\n## B\n\n### C\n\n#### D",
    "> 引用\n\n- [ ] 待办\n- [x] 已办",
    "![图](/file/attachments/0000-aa/shot.png)",
  ];

  it.each(samples)("stays stable after the first serialization: %s", (md) => {
    const once = round(md);
    const twice = round(once);
    expect(twice).toBe(once);
  });

  it("keeps the article-only surfaces on the way out", () => {
    expect(round("| 列A | 列B |\n| --- | --- |\n| 1 | 2 |")).toContain("| 列A");
    expect(round("```python\nprint(1)\n```")).toContain("```python");
    expect(round("#### D")).toContain("#### D");
  });
});
