/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");

/**
 * Typography contract for the app shell. Every assertion here guards a silent
 * regression rather than a crash: dropping a language scope hands Japanese
 * kanji to a Chinese face, and moving the bundled Arabic font ahead of
 * var(--font-cjk) lets its math/symbol subsets take ① ★ → away from the
 * platform Han faces that shape them.
 */
function declaration(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([\\s\\S]*?);`));
  if (!match) throw new Error(`--${name} is not declared in index.css`);
  return match[1];
}

describe("app font stacks", () => {
  it("leads with the bundled Latin face", () => {
    expect(declaration("font-sans").trimStart()).toMatch(/^"Geist Variable"/);
    expect(declaration("font-heading").trimStart()).toMatch(
      /^"Geist Variable"/,
    );
  });

  it("routes Han text through the language-scoped variable", () => {
    const sans = declaration("font-sans");
    expect(sans).toContain("var(--font-cjk)");
    expect(declaration("font-heading")).toContain("var(--font-cjk)");
    // Naming a Han face directly bypasses :lang() and would reintroduce the
    // Chinese-glyph-for-Japanese bug this stack exists to prevent.
    expect(sans).not.toMatch(/PingFang|Hiragino|YaHei|Noto Sans CJK/);
  });

  it("keeps the bundled Arabic face behind the Han faces", () => {
    const sans = declaration("font-sans");
    expect(sans.indexOf('"Noto Sans Arabic Variable"')).toBeGreaterThan(
      sans.indexOf("var(--font-cjk)"),
    );
  });

  it("scopes the Han list per script", () => {
    const list = (pattern: RegExp) =>
      css.match(pattern)?.[1].replace(/\s+/g, " ").trim() ?? "";

    const zh = list(/:root\s*\{[^}]*--font-cjk:\s*([\s\S]*?);/);
    const ja = list(/:root:lang\(ja\)\s*\{[^}]*--font-cjk:\s*([\s\S]*?);/);
    const ko = list(/:root:lang\(ko\)\s*\{[^}]*--font-cjk:\s*([\s\S]*?);/);

    expect(zh).toMatch(/^"PingFang SC"/);
    expect(ja).toMatch(/Hiragino Sans|Yu Gothic/);
    expect(ko).toMatch(/Apple SD Gothic Neo|Malgun Gothic/);
    // A ja/ko list must never lead with a Simplified-Chinese face.
    expect(ja).not.toMatch(/^"PingFang SC"/);
    expect(ko).not.toMatch(/^"PingFang SC"/);
  });
});

/**
 * Share-card plugins pick one of four families by name, so the serif tier is
 * part of the plugin API: it must keep resolving through the language-scoped
 * variables rather than a hardcoded Han face (which is what painted Japanese
 * users' exported cards with Chinese glyphs).
 */
describe("share card font tiers", () => {
  it("exposes a serif tier that defers its Han faces to the script scope", () => {
    const serif = declaration("font-serif");
    expect(serif).toContain("var(--font-cjk-serif)");
    expect(serif).not.toMatch(/Songti|SimSun|Mincho/);
  });

  it("scopes the Han serif list per script", () => {
    const list = (pattern: RegExp) =>
      css.match(pattern)?.[1].replace(/\s+/g, " ").trim() ?? "";
    const zh = list(/:root\s*\{[^}]*--font-cjk-serif:\s*([\s\S]*?);/);
    const ja = list(/:root:lang\(ja\)\s*\{[^}]*--font-cjk-serif:\s*([\s\S]*?);/);

    expect(zh).toMatch(/^"Songti SC"/);
    expect(ja).toMatch(/Mincho/);
    expect(ja).not.toMatch(/^"Songti SC"/);
  });
});
