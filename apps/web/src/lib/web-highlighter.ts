import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/**
 * Web-side Shiki singleton for article surfaces. Mirrors the worker's
 * article highlighter (same themes, same language set) but lives in a
 * lazy-loaded chunk: the reading/composer surfaces never pay for it. The
 * JS regex engine (no WASM) keeps the browser bundle simple.
 */

type LanguageImport = import("shiki/core").LanguageInput;
const LANG_IMPORTS: Record<string, LanguageImport> = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  // Shiki registers each module under its own name plus DSL aliases (ts, js,
  // mjs, …), but tsx/jsx are separate grammars, not aliases of their base
  // languages — so each fence alias needs its own entry to be highlightable.
  ts: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  js: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
  shell: () => import("shiki/langs/bash.mjs"),
  sh: () => import("shiki/langs/bash.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  go: () => import("shiki/langs/go.mjs"),
};

type Highlighter = HighlighterCore;

let highlighterPromise: Promise<Highlighter> | null = null;

export function getWebHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighterCore({
    themes: [
      import("shiki/themes/github-light.mjs"),
      import("shiki/themes/github-dark.mjs"),
    ],
    langs: [LANG_IMPORTS.typescript, LANG_IMPORTS.javascript],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighterPromise;
}

/** Loads every code-fence language the content requests. */
export async function preloadWebCodeLanguages(content: string): Promise<void> {
  const highlighter = await getWebHighlighter();
  const requested = new Set<string>();
  for (const match of content.matchAll(/^\s*```([A-Za-z0-9_-]*)/gm)) {
    const lang = (match[1] ?? "").toLowerCase();
    if (lang && LANG_IMPORTS[lang]) requested.add(lang);
  }
  for (const lang of requested) {
    if (highlighter.getLoadedLanguages().includes(lang)) continue;
    await highlighter.loadLanguage(LANG_IMPORTS[lang]);
  }
}
