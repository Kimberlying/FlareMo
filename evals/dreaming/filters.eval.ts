/**
 * Offline eval for the deterministic stages of Dreaming (no model calls).
 *
 *   pnpm exec tsx evals/dreaming/filters.eval.ts
 *
 * 1. isImperativeContent — every candidate it flags is dropped by
 *    runDreamingCycle. We measure how often it drops legitimate facts
 *    (false positives) and how often real instructions slip past it
 *    (false negatives).
 * 2. createDreamingExtractor's output parsing — raw model text is replayed
 *    through the production extractor with a fake AI binding, so the exact
 *    shipped parser and length gate are what's measured.
 *
 * Results print to stdout and are written to evals/dreaming/results/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createDreamingExtractor } from "../../apps/worker/src/memory-dreaming";
import { isImperativeContent } from "../../packages/domain/src/memory/consolidation";

type ImperativeCase = {
  id: string;
  lang: "en" | "zh";
  label: "fact" | "instruction";
  category: string;
  text: string;
  ambiguous?: boolean;
  note?: string;
};

type ParserCase = {
  id: string;
  category: string;
  raw: string;
  expected_kept: number;
  note?: string;
};

const here = path.dirname(new URL(import.meta.url).pathname);
const load = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(here, "data", file), "utf8")) as T;

const pct = (n: number, d: number) =>
  d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// 1. Imperative filter
// ---------------------------------------------------------------------------

function evalImperative(cases: ImperativeCase[]) {
  // "Positive" = an instruction (what the filter is meant to catch).
  const rows = cases.map((c) => ({
    ...c,
    flagged: isImperativeContent(c.text),
  }));

  const confusion = (subset: typeof rows) => {
    const tp = subset.filter((r) => r.label === "instruction" && r.flagged);
    const fn = subset.filter((r) => r.label === "instruction" && !r.flagged);
    const fp = subset.filter((r) => r.label === "fact" && r.flagged);
    const tn = subset.filter((r) => r.label === "fact" && !r.flagged);
    return {
      n: subset.length,
      tp: tp.length,
      fn: fn.length,
      fp: fp.length,
      tn: tn.length,
      // TPR: instructions caught. TNR: facts kept.
      tpr: pct(tp.length, tp.length + fn.length),
      tnr: pct(tn.length, tn.length + fp.length),
    };
  };

  const byLang = {
    en: confusion(rows.filter((r) => r.lang === "en")),
    zh: confusion(rows.filter((r) => r.lang === "zh")),
  };
  const unambiguous = confusion(rows.filter((r) => !r.ambiguous));

  const categories = [...new Set(rows.map((r) => r.category))].map(
    (category) => {
      const subset = rows.filter((r) => r.category === category);
      const correct = subset.filter(
        (r) => r.flagged === (r.label === "instruction"),
      ).length;
      return { category, n: subset.length, correct };
    },
  );

  return {
    overall: confusion(rows),
    unambiguous,
    byLang,
    categories,
    falsePositives: rows
      .filter((r) => r.label === "fact" && r.flagged)
      .map(({ id, text, category, ambiguous }) => ({
        id,
        text,
        category,
        ambiguous: Boolean(ambiguous),
      })),
    falseNegatives: rows
      .filter((r) => r.label === "instruction" && !r.flagged)
      .map(({ id, text, category }) => ({ id, text, category })),
  };
}

// ---------------------------------------------------------------------------
// 2. Parser + length gate, via the production extractor
// ---------------------------------------------------------------------------

async function evalParser(cases: ParserCase[]) {
  const rows = [];
  for (const c of cases) {
    const env = {
      AI: { run: async () => ({ response: c.raw }) },
    } as unknown as Parameters<typeof createDreamingExtractor>[0];
    const extractor = createDreamingExtractor(env);
    const kept = await extractor(
      [
        {
          kind: "memo",
          id: "m1",
          createdAt: "2026-10-26T00:00:00.000Z",
          content: "placeholder source",
        },
      ] as never,
      [],
    );
    rows.push({
      id: c.id,
      category: c.category,
      expected: c.expected_kept,
      kept: kept.length,
      pass: kept.length === c.expected_kept,
      lost: c.expected_kept - kept.length,
      note: c.note,
    });
  }
  const expectedTotal = rows.reduce((s, r) => s + r.expected, 0);
  const keptTotal = rows.reduce((s, r) => s + Math.min(r.kept, r.expected), 0);
  return {
    cases: rows.length,
    passed: rows.filter((r) => r.pass).length,
    factsExpected: expectedTotal,
    factsKept: keptTotal,
    factRecall: pct(keptTotal, expectedTotal),
    failures: rows.filter((r) => !r.pass),
  };
}

// ---------------------------------------------------------------------------

const imperative = evalImperative(
  load<{ cases: ImperativeCase[] }>("imperative-cases.json").cases,
);
const parser = await evalParser(
  load<{ cases: ParserCase[] }>("parser-cases.json").cases,
);

const o = imperative.overall;
console.log("\n=== isImperativeContent ===");
console.log(
  `n=${o.n}  instructions caught (TPR) ${o.tpr}  facts kept (TNR) ${o.tnr}  [TP ${o.tp} FN ${o.fn} FP ${o.fp} TN ${o.tn}]`,
);
const u = imperative.unambiguous;
console.log(
  `unambiguous only n=${u.n}: TPR ${u.tpr}  TNR ${u.tnr}`,
);
for (const [lang, c] of Object.entries(imperative.byLang)) {
  console.log(`  ${lang}: TPR ${c.tpr}  TNR ${c.tnr}  (n=${c.n})`);
}
console.log("\nBy category (correct / n):");
for (const c of imperative.categories) {
  console.log(`  ${c.category.padEnd(26)} ${c.correct}/${c.n}`);
}
console.log("\nFacts wrongly dropped:");
for (const r of imperative.falsePositives) {
  console.log(`  ${r.id}${r.ambiguous ? " (ambiguous)" : ""}  ${r.text}`);
}
console.log("\nInstructions that slip through:");
for (const r of imperative.falseNegatives) {
  console.log(`  ${r.id}  ${r.text}`);
}

console.log("\n=== Extractor parsing + length gate ===");
console.log(
  `cases passed ${parser.passed}/${parser.cases}   facts surviving parse ${parser.factsKept}/${parser.factsExpected} (${parser.factRecall})`,
);
for (const f of parser.failures) {
  console.log(
    `  ${f.id} ${f.category.padEnd(28)} expected ${f.expected}, kept ${f.kept}${f.note ? `  — ${f.note}` : ""}`,
  );
}

const outDir = path.join(here, "results");
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const outFile = path.join(outDir, `filters-${stamp}.json`);
writeFileSync(
  outFile,
  `${JSON.stringify({ runAt: new Date().toISOString(), imperative, parser }, null, 2)}\n`,
);
console.log(`\nWrote ${path.relative(process.cwd(), outFile)}`);
