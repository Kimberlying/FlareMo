import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readPluginPackage, sha256Hex, zipPluginFiles } from "./package";

const encoder = new TextEncoder();

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    specVersion: 1,
    id: "demo-pack",
    version: "1.2.3",
    name: { "zh-CN": "示例", "en-US": "Demo" },
    contributes: {
      shareCardTemplates: [
        {
          id: "demo",
          kind: "document",
          name: { en: "Demo" },
          document: "cards/demo.json",
        },
      ],
    },
    ...overrides,
  };
}

function zip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = encoder.encode(content);
  }
  return zipSync(entries);
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
    children: [{ type: "text", text: "{body}", style: { flex: 1 } }],
  },
};

describe("readPluginPackage", () => {
  it("reads a well-formed package and strips the folder prefix", () => {
    const bytes = zip({
      "demo-pack/plugin.json": JSON.stringify(manifest()),
      "demo-pack/cards/demo.json": JSON.stringify(validDocument),
    });
    const pkg = readPluginPackage(bytes);
    expect(pkg.manifest.id).toBe("demo-pack");
    expect(Object.keys(pkg.files).sort()).toEqual([
      "cards/demo.json",
      "plugin.json",
    ]);
  });

  it("rejects a package whose folder does not match the manifest id", () => {
    const bytes = zip({
      "other-pack/plugin.json": JSON.stringify(manifest()),
      "other-pack/cards/demo.json": "{}",
    });
    expect(() => readPluginPackage(bytes)).toThrow(/must match/);
  });

  it("rejects path traversal", () => {
    const bytes = zip({
      "demo-pack/plugin.json": JSON.stringify(manifest()),
      "demo-pack/../evil.txt": "nope",
    });
    expect(() => readPluginPackage(bytes)).toThrow(/unsafe path|inside/);
  });

  it("rejects files outside the top-level folder", () => {
    const bytes = zip({
      "demo-pack/plugin.json": JSON.stringify(manifest()),
      "demo-pack/cards/demo.json": "{}",
      "stray.txt": "hello",
    });
    expect(() => readPluginPackage(bytes)).toThrow(/inside/);
  });

  it("rejects a manifest that references a missing file", () => {
    const bytes = zip({
      "demo-pack/plugin.json": JSON.stringify(manifest()),
    });
    expect(() => readPluginPackage(bytes)).toThrow(/missing file/);
  });

  it("rejects invalid manifests", () => {
    const bytes = zip({
      "demo-pack/plugin.json": JSON.stringify(manifest({ specVersion: 2 })),
      "demo-pack/cards/demo.json": "{}",
    });
    expect(() => readPluginPackage(bytes)).toThrow(/specVersion/);
  });

  it("rejects non-zip input and empty archives", () => {
    expect(() => readPluginPackage(encoder.encode("not a zip"))).toThrow();
    expect(() => readPluginPackage(new Uint8Array(0))).toThrow(/empty/);
  });
});

describe("sha256Hex", () => {
  it("hashes bytes to lowercase hex", async () => {
    expect(await sha256Hex(encoder.encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("zipPluginFiles", () => {
  it("is reproducible: identical content zips to identical bytes", async () => {
    const files = {
      "demo-pack/plugin.json": encoder.encode(JSON.stringify(manifest())),
      "demo-pack/cards/demo.json": encoder.encode(
        JSON.stringify(validDocument),
      ),
    };
    const first = zipPluginFiles(files);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const second = zipPluginFiles(files);
    expect(await sha256Hex(first)).toBe(await sha256Hex(second));
  });

  it("round-trips through readPluginPackage", () => {
    const zipped = zipPluginFiles({
      "demo-pack/plugin.json": encoder.encode(JSON.stringify(manifest())),
      "demo-pack/cards/demo.json": encoder.encode(
        JSON.stringify(validDocument),
      ),
    });
    const pkg = readPluginPackage(zipped);
    expect(pkg.manifest.id).toBe("demo-pack");
  });
});
