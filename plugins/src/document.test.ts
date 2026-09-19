import { describe, expect, it } from "vitest";
import {
  applyBindings,
  isUnsafeCSS,
  resolveColor,
  resolveLocalizedText,
  resolveOptionValues,
  type ShareCardRenderContext,
} from "./document";
import type { ShareCardOptionSpec } from "./spec";

const context: ShareCardRenderContext = {
  data: {
    body: "hello",
    date: "2026/09/18",
    day: "18",
    stats: "12 条记录 · 3 天",
    locale: "zh-CN",
    brand: { product: "KOSX", markLight: null, markDark: null },
  },
  options: { accent: "#ff0000", showStats: false },
  mode: "light",
};

describe("resolveLocalizedText", () => {
  it("prefers the exact locale, then the base language, then en-US", () => {
    const text = { "zh-CN": "素白", en: "Plain", ja: "素白" };
    expect(resolveLocalizedText(text, "zh-CN")).toBe("素白");
    expect(resolveLocalizedText(text, "zh-Hant")).toBe("素白");
    expect(resolveLocalizedText({ en: "Only english" }, "fr")).toBe(
      "Only english",
    );
  });

  it("passes plain strings through", () => {
    expect(resolveLocalizedText("literal", "zh-CN")).toBe("literal");
  });
});

describe("isUnsafeCSS", () => {
  it("rejects network and script vectors", () => {
    expect(isUnsafeCSS("url(https://evil.example/x.png)")).toBe(true);
    expect(isUnsafeCSS("expression(alert(1))")).toBe(true);
    expect(isUnsafeCSS("javascript:alert(1)")).toBe(true);
    expect(
      isUnsafeCSS(
        "repeating-linear-gradient(90deg, #000 0 2px, transparent 2px 5px)",
      ),
    ).toBe(false);
  });
});

describe("resolveColor", () => {
  it("maps brand tokens and app tokens to CSS variables", () => {
    expect(resolveColor("brand.500", "light")).toBe("var(--brand-500)");
    expect(resolveColor("brand.coral", "light")).toBe("var(--brand-coral)");
    expect(resolveColor("foreground", "light")).toBe("var(--foreground)");
  });

  it("picks the matching variant from light/dark pairs", () => {
    const pair = { light: "#ffffff", dark: "#171717" };
    expect(resolveColor(pair, "light")).toBe("#ffffff");
    expect(resolveColor(pair, "dark")).toBe("#171717");
  });

  it("drops unknown tokens and unsafe values", () => {
    expect(resolveColor("brand.123", "light")).toBeUndefined();
    expect(resolveColor("url(https://evil.example)", "light")).toBeUndefined();
  });
});

describe("applyBindings", () => {
  it("substitutes data, brand, and option bindings", () => {
    expect(applyBindings("由 {brand.product} 记录", context)).toBe(
      "由 KOSX 记录",
    );
    expect(applyBindings("{body} · {stats}", context)).toBe(
      "hello · 12 条记录 · 3 天",
    );
    expect(applyBindings("accent {options.accent}", context)).toBe(
      "accent #ff0000",
    );
  });

  it("leaves unknown tokens untouched", () => {
    expect(applyBindings("{nope}", context)).toBe("{nope}");
  });

  it("zero-pads the day with {day.padded}", () => {
    const singleDigit = {
      ...context,
      data: { ...context.data, day: "8" },
    };
    expect(applyBindings("{day}", singleDigit)).toBe("8");
    expect(applyBindings("{day.padded}", singleDigit)).toBe("08");
    expect(applyBindings("{day.padded}", context)).toBe("18");
    expect(
      applyBindings("{day.padded}", {
        ...context,
        data: { ...context.data, day: "" },
      }),
    ).toBe("");
  });
});

describe("resolveOptionValues", () => {
  const specs: ShareCardOptionSpec[] = [
    {
      key: "accent",
      type: "color",
      label: { en: "Accent" },
      default: "#111111",
    },
    {
      key: "showStats",
      type: "boolean",
      label: { en: "Stats" },
      default: true,
    },
    {
      key: "title",
      type: "text",
      label: { en: "Title" },
      default: "Note",
      maxLength: 5,
    },
    {
      key: "style",
      type: "enum",
      label: { en: "Style" },
      default: "a",
      choices: [
        { value: "a", label: { en: "A" } },
        { value: "b", label: { en: "B" } },
      ],
    },
  ];

  it("applies defaults when nothing is configured", () => {
    expect(resolveOptionValues(specs, undefined)).toEqual({
      accent: "#111111",
      showStats: true,
      title: "Note",
      style: "a",
    });
  });

  it("honours configured values and clamps text length", () => {
    expect(
      resolveOptionValues(specs, {
        accent: "#222222",
        showStats: false,
        title: "way too long",
        style: "b",
      }),
    ).toEqual({
      accent: "#222222",
      showStats: false,
      title: "way t",
      style: "b",
    });
  });

  it("ignores unknown keys and wrong types", () => {
    expect(
      resolveOptionValues(specs, {
        nope: "x",
        showStats: "not-a-boolean",
        style: "zzz",
      }),
    ).toEqual({
      accent: "#111111",
      showStats: true,
      title: "Note",
      style: "a",
    });
  });
});
