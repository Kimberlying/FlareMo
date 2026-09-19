import { describe, expect, it } from "vitest";
import { checkPluginFiles, type PluginCheckInput } from "./check";

const encoder = new TextEncoder();

function file(content: unknown): Uint8Array {
  return encoder.encode(
    typeof content === "string" ? content : JSON.stringify(content),
  );
}

function packageFiles(
  manifest: Record<string, unknown>,
  extra: Record<string, Uint8Array> = {},
): Record<string, Uint8Array> {
  return { "plugin.json": file(manifest), ...extra };
}

function baseManifest(overrides: Record<string, unknown> = {}) {
  return {
    specVersion: 1,
    id: "demo-pack",
    version: "1.0.0",
    name: { "en-US": "Demo" },
    author: { name: "Author" },
    license: "MIT",
    contributes: {
      shareCardTemplates: [
        {
          id: "demo",
          kind: "document",
          name: { "en-US": "Demo card" },
          document: "cards/demo.json",
        },
      ],
    },
    ...overrides,
  };
}

const validDocument = {
  specVersion: 1,
  root: {
    type: "column",
    style: {
      height: "100%",
      padding: 24,
      background: "#ffffff",
      color: "#111111",
    },
    children: [
      {
        type: "text",
        text: "{body}",
        style: { flex: 1, clamp: 10, font: { size: 15, lineHeight: 1.8 } },
      },
      {
        type: "row",
        style: { justify: "space-between" },
        children: [
          { type: "text", text: "{stats}" },
          { type: "text", text: "{brand.product} · {date}" },
        ],
      },
    ],
  },
};

function errorsOf(input: PluginCheckInput) {
  return checkPluginFiles(input).issues.filter(
    (issue) => issue.severity === "error",
  );
}

function warningsOf(input: PluginCheckInput) {
  return checkPluginFiles(input).issues.filter(
    (issue) => issue.severity === "warning",
  );
}

describe("checkPluginFiles — document cards", () => {
  it("accepts a well-formed package", () => {
    const result = checkPluginFiles({
      files: packageFiles(baseManifest(), {
        "cards/demo.json": file(validDocument),
      }),
      rootFolder: "demo-pack",
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.pluginId).toBe("demo-pack");
  });

  it("rejects an unknown node type", () => {
    const errors = errorsOf({
      files: packageFiles(baseManifest(), {
        "cards/demo.json": file({
          specVersion: 1,
          root: { type: "grid", children: [] },
        }),
      }),
    });
    expect(errors.map((issue) => issue.code)).toContain("card/unknown-node");
  });

  it("rejects a missing payload file", () => {
    const errors = errorsOf({ files: packageFiles(baseManifest()) });
    expect(errors.map((issue) => issue.code)).toContain("card/missing-file");
  });

  it("rejects a wrong document specVersion", () => {
    const errors = errorsOf({
      files: packageFiles(baseManifest(), {
        "cards/demo.json": file({ specVersion: 2, root: { type: "column" } }),
      }),
    });
    expect(errors.map((issue) => issue.code)).toContain("card/spec-version");
  });

  it("rejects unknown brand tokens and url() colors", () => {
    const errors = errorsOf({
      files: packageFiles(baseManifest(), {
        "cards/demo.json": file({
          specVersion: 1,
          root: {
            type: "column",
            style: { color: "brand.999" },
            children: [
              {
                type: "text",
                text: "x",
                style: { background: "url(https://x)" },
              },
            ],
          },
        }),
      }),
    });
    const codes = errors.map((issue) => issue.code);
    expect(codes).toContain("color/unknown-token");
    expect(codes).toContain("color/unsafe");
  });

  it("rejects an undeclared option binding", () => {
    const errors = errorsOf({
      files: packageFiles(baseManifest(), {
        "cards/demo.json": file({
          specVersion: 1,
          root: { type: "text", text: "{options.accent}" },
        }),
      }),
    });
    expect(errors.map((issue) => issue.code)).toContain(
      "binding/unknown-option",
    );
  });

  it("accepts a declared option binding", () => {
    const contributes = baseManifest().contributes as {
      shareCardTemplates: Record<string, unknown>[];
    };
    const card = contributes.shareCardTemplates[0];
    if (!card) throw new Error("fixture is missing its card");
    card.options = [
      {
        key: "accent",
        type: "color",
        label: { en: "Accent" },
        default: "#000000",
      },
    ];
    const manifest = baseManifest({ contributes });
    const errors = errorsOf({
      files: packageFiles(manifest, {
        "cards/demo.json": file({
          specVersion: 1,
          root: { type: "text", text: "{options.accent}" },
        }),
      }),
    });
    expect(errors).toEqual([]);
  });

  it("rejects an SVG element outside the whitelist", () => {
    const errors = errorsOf({
      files: packageFiles(baseManifest(), {
        "cards/demo.json": file({
          specVersion: 1,
          root: {
            type: "svg",
            viewBox: "0 0 10 10",
            children: [{ tag: "foreignObject", attrs: {} }],
          },
        }),
      }),
    });
    expect(errors.map((issue) => issue.code)).toContain("svg/unknown-tag");
  });

  it("rejects external images", () => {
    const errors = errorsOf({
      files: packageFiles(baseManifest(), {
        "cards/demo.json": file({
          specVersion: 1,
          root: { type: "image", src: "https://example.com/a.png" },
        }),
      }),
    });
    expect(errors.map((issue) => issue.code)).toContain("image/external");
  });

  it("warns (not errors) on unknown bindings and style keys", () => {
    const issues = warningsOf({
      files: packageFiles(baseManifest(), {
        "cards/demo.json": file({
          specVersion: 1,
          root: {
            type: "text",
            text: "{mystery}",
            style: { glow: 1, font: { size: 12 } },
          },
        }),
      }),
    });
    const codes = issues.map((issue) => issue.code);
    expect(codes).toContain("binding/unknown");
    expect(codes).toContain("style/unknown-key");
  });
});

describe("checkPluginFiles — sandbox cards", () => {
  function sandboxManifest(entry = "cards/demo/index.html") {
    return baseManifest({
      contributes: {
        shareCardTemplates: [
          {
            id: "demo",
            kind: "sandbox",
            name: { en: "Demo" },
            entry,
          },
        ],
      },
    });
  }

  it("accepts self-contained inline markup", () => {
    const html = `<!doctype html><html><head><style>#c{width:340px;height:420px}</style></head>
<body><div id="c"></div><script>window.__flaremoCaptureTarget=document.getElementById("c");</script></body></html>`;
    const result = checkPluginFiles({
      files: packageFiles(sandboxManifest(), {
        "cards/demo/index.html": file(html),
      }),
      rootFolder: "demo-pack",
    });
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("rejects scripts and styles loaded from the network", () => {
    const errors = errorsOf({
      files: packageFiles(sandboxManifest(), {
        "cards/demo/index.html": file(
          `<html><head><link rel="stylesheet" href="https://cdn.example/x.css"></head>
<body><script src="https://cdn.example/x.js"></script></body></html>`,
        ),
      }),
    });
    const codes = errors.map((issue) => issue.code);
    expect(codes).toContain("sandbox/external-script");
    expect(codes).toContain("sandbox/external-style");
  });

  it("rejects absolute paths and missing local assets", () => {
    const errors = errorsOf({
      files: packageFiles(sandboxManifest(), {
        "cards/demo/index.html": file(
          `<html><body><img src="/assets/logo.png"><img src="./missing.png"></body></html>`,
        ),
      }),
    });
    const codes = errors.map((issue) => issue.code);
    expect(codes).toContain("sandbox/absolute-path");
    expect(codes).toContain("sandbox/missing-asset");
  });

  it("accepts a local asset that exists in the package", () => {
    const errors = errorsOf({
      files: packageFiles(sandboxManifest(), {
        "cards/demo/index.html": file(
          `<html><body><img src="../../img/logo.png"></body></html>`,
        ),
        "img/logo.png": new Uint8Array([1, 2, 3]),
      }),
    });
    expect(errors).toEqual([]);
  });

  it("rejects @import and base tags", () => {
    const errors = errorsOf({
      files: packageFiles(sandboxManifest(), {
        "cards/demo/index.html": file(
          `<html><head><base href="/"><style>@import url("x.css");</style></head></html>`,
        ),
      }),
    });
    const codes = errors.map((issue) => issue.code);
    expect(codes).toContain("sandbox/base-tag");
    expect(codes).toContain("sandbox/css-import");
  });
});

describe("checkPluginFiles — package-level rules", () => {
  it("flags an id that does not match the folder", () => {
    const errors = errorsOf({
      files: packageFiles(baseManifest(), {
        "cards/demo.json": file(validDocument),
      }),
      rootFolder: "other-folder",
    });
    expect(errors.map((issue) => issue.code)).toContain("manifest/id-mismatch");
  });

  it("requires an author for community packages", () => {
    const manifest = baseManifest({ author: undefined });
    const errors = errorsOf({
      files: packageFiles(manifest, {
        "cards/demo.json": file(validDocument),
      }),
      tier: "community",
    });
    expect(errors.map((issue) => issue.code)).toContain(
      "manifest/missing-author",
    );
  });

  it("warns about unknown manifest fields", () => {
    const issues = warningsOf({
      files: packageFiles(baseManifest({ fancy: true }), {
        "cards/demo.json": file(validDocument),
      }),
    });
    expect(issues.map((issue) => issue.code)).toContain(
      "manifest/unknown-field",
    );
  });

  it("errors when plugin.json is missing entirely", () => {
    const result = checkPluginFiles({ files: {} });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "manifest/missing",
    );
  });

  it("errors when plugin.json is not valid JSON", () => {
    const result = checkPluginFiles({
      files: { "plugin.json": file("not json {") },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "manifest/invalid-json",
    );
  });

  it("rejects oversized and non-PNG previews", () => {
    const large = new Uint8Array(600 * 1024);
    large.set([0x89, 0x50, 0x4e, 0x47], 0);
    const errors = errorsOf({
      files: packageFiles(
        baseManifest({
          contributes: {
            shareCardTemplates: [
              {
                id: "demo",
                kind: "document",
                name: { en: "Demo" },
                document: "cards/demo.json",
                preview: "preview.png",
              },
            ],
          },
        }),
        { "cards/demo.json": file(validDocument), "preview.png": large },
      ),
    });
    expect(errors.map((issue) => issue.code)).toContain("preview/too-large");
  });
});
