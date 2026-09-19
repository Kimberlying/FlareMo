# Plugins

FlareMo plugins extend the app through **slots**. A plugin is a folder: a
manifest plus the files it references. Adding one never touches core code —
the app discovers plugins at build time and admins choose what to enable.

The platform currently ships one slot: **`shareCardTemplates`** — cards the
share-image dialog offers. The machinery (packages, validation, store,
sandbox) is slot-independent; more slots arrive through spec versions.

- [Quick start](#quick-start)
- [Packages](#packages)
- [Manifest](#manifest)
- [Document cards](#document-cards-json)
- [Sandbox cards](#sandbox-cards-html)
- [Options](#options)
- [The store registry](#the-store-registry)
- [Contribution review](#contribution-review)

## Quick start

```bash
pnpm plugin:new my-pack                    # scaffold plugins/community/my-pack
pnpm plugin:check plugins/community/my-pack
pnpm dev                                   # preview in the share dialog
pnpm plugins:build                          # zip + sha256 + registry.json
```

`plugin:new` writes a plugin that already passes `plugin:check`; start from
there. `--kind document|sandbox` picks the card flavor, `--tier community`
(default) or `official`.

## Packages

A package is a folder (or the zip built from it). The zip keeps exactly one
top-level folder named after the plugin id:

```
my-pack/
  plugin.json          manifest (required)
  preview.png          store preview, PNG, ≤512KB (recommended)
  cards/…              card payloads and any assets they reference
```

Hard limits — the same numbers in `plugin:check`, the repo build, and every
instance that installs the package:

| Limit | Value |
| --- | --- |
| zip size | 4MB |
| files | 64 |
| single file | 4MB |
| uncompressed total | 8MB |
| preview | 512KB |
| fonts | 2 files, 400KB each |

Plugins run **without network access** and are self-contained: assets are
inlined (`data:` URIs) or live next to the card. That constraint is what lets
a store package run safely in a user's browser — it is not negotiable.

## Manifest

`plugin.json`:

```jsonc
{
  "specVersion": 1,               // platform spec version
  "id": "my-pack",                // kebab-case, must equal the folder name
  "version": "1.0.0",             // semver of your plugin
  "name":        { "zh-CN": "我的卡片", "en-US": "My pack" },
  "description": { "zh-CN": "……" },           // optional
  "author": { "name": "Your name" },          // required for community plugins
  "license": "AGPL-3.0-only",                 // SPDX; defaults to AGPL-3.0-only
  "defaultEnabled": false,                    // official: true, community: false
  "minAppVersion": "0.21.0",                  // optional
  "contributes": {
    "shareCardTemplates": [
      {
        "id": "my-card",                        // kebab-case, unique across plugins
        "kind": "document",                     // "document" | "sandbox"
        "name": { "zh-CN": "我的卡片", "en-US": "My card" },
        "size": { "width": 340, "height": 420 }, // optional, 200–1200px
        "preview": "cards/my-card/preview.png",  // optional, PNG
        "document": "cards/my-card.json",        // kind: document
        "entry": "cards/my-card/index.html"      // kind: sandbox
      }
    ]
  }
}
```

Locale tables resolve as **exact locale → base language → `en-US` → first
entry**; unknown fields are ignored with a warning so the format can grow.

## Document cards (JSON)

Data, not code: the app renders it, you declare it. No bundler, no sandbox —
the friendliest path for non-developers. Full example:
[`official/flaremo-cards/cards/postcard.json`](official/flaremo-cards/cards/postcard.json).

```jsonc
{
  "specVersion": 1,
  "root": {
    "type": "column",
    "style": { "height": "100%", "padding": 28, "background": "#f6f0e5", "color": "#34312d" },
    "children": [
      { "type": "text", "text": "{body}", "style": { "flex": 1, "clamp": 10, "font": { "size": 15, "lineHeight": 1.9 } } },
      { "type": "row", "style": { "justify": "space-between" },
        "children": [
          { "type": "text", "text": "{stats}" },
          { "type": "text", "text": "{brand.product}" }
        ] }
    ]
  }
}
```

**Nodes** — `row` / `column` (flex containers), `text`, `image`, `svg`,
`divider`, `spacer`.

**Style** — layout (`padding`/`paddingX`/`paddingY`, margins, `gap`,
`width`/`height`, `flex`, `align`, `justify`, `position` + `top/right/bottom/left`,
`overflow`, `rotate`); appearance (`background`, `backgroundCSS` gradients,
`borderWidth`/`borderColor`/`borderStyle`, `borderRadius`, `shadow`
(`none|sm|md|lg`) or `shadowCSS`, `opacity`); text (`font.size/weight/lineHeight/letterSpacing/align/uppercase/color`,
`clamp` for line truncation). Unknown keys warn and are ignored.

**Colors** — `#rgb` / `#rrggbb` / `#rrggbbaa`, a `{ "light": …, "dark": … }`
pair, an app token (`foreground`, `background`, `card`, `muted`, `border`), or
a **brand token** (`brand.50` … `brand.700`, `brand.coral`) that follows the
instance accent.

**Bindings** — `{body}` `{date}` `{day}` `{day.padded}` `{stats}` `{locale}`
`{brand.product}` `{brand.markLight}` `{brand.markDark}`; text may mix them
(`"由 {brand.product} 记录"`). Options are referenced as `{options.<key>}`.

**Static labels** are locale tables: `"text": { "zh-CN": "记忆便签", "en-US": "Memory note" }`.

**SVG** — for textures, watercolor horizons, barcodes. Allowed elements:
`path circle ellipse rect line polyline polygon g defs linearGradient
radialGradient stop filter feTurbulence feDisplacementMap feGaussianBlur
feColorMatrix feBlend feMerge feMergeNode feOffset title`. Attribute values
follow the color rules; `filter` takes `url(#id)`; no event handlers.

## Sandbox cards (HTML)

When you need real code (canvas, animation, layout the document model cannot
express): a self-contained HTML entry that renders into an opaque-origin
iframe. Reference example:
[`official/sandbox-demo/cards/stamp/index.html`](official/sandbox-demo/cards/stamp/index.html).

Two globals connect you to the host:

```js
window.__flaremoCaptureTarget = document.getElementById("card"); // what gets exported

window.__flaremoOnUpdate = (payload) => {
  // payload.data    body, date, day, stats, locale, brand{product,markLight,markDark}
  // payload.options your configured option values
  // payload.mode    "light" | "dark"
};
```

Rules the checker enforces:

- **No network, ever.** External `src`/`href`/`url()`/`@import`/`<script src>`
  are errors. Inline scripts and `<style>` are fine; images must be `data:` URIs.
- **Self-contained.** Referenced local files must exist inside your package
  (they are fetched by the host and inlined).
- Canvas is supported; the host swaps `<canvas>` for its bitmap during export.
- No `<base>`, nested iframes, `<object>`/`<embed>`.

## Options

Declare options to give instance admins knobs; `plugin:check` verifies that
every `{options.key}` in your card is declared.

```jsonc
{
  "key": "accent",
  "type": "color",                          // boolean | text | color | number | enum
  "label": { "zh-CN": "点缀色", "en-US": "Accent color" },
  "default": "#c2410c"
}
```

Limits: ≤20 options per card; configured values under 8KB per instance.

## The store registry

`pnpm plugins:build` scans `plugins/{official,community}/*/` and writes:

- `plugins/dist/store/<id>/<id>-<version>.zip` (+ `preview.png`) — the artifacts
- `plugins/registry.json` — the directory index (tracked in git)

Each entry carries the artifact's `sha256`; instances verify it before
installing. Builds are reproducible: identical content produces identical
bytes, so the registry only changes when the store does. The official store
is mirrored to `https://flaremo.app/plugins/` by the site build; any instance
can also point at a custom directory source with the same format.

## Contribution review

To propose a plugin for the store: add your folder under
`plugins/community/<id>/`, run `pnpm plugin:check` and `pnpm plugins:build`,
and open a PR including the regenerated `registry.json`.

Review looks at:

1. **`plugin:check` clean** — errors block; warnings are judged in context.
2. **Author and license declared** — required for community packages.
3. **No brand or content that misrepresents** — brand packs are welcome, but
   they must say whose brand they carry (name/description) and stay off by
   default (community packages already are).
4. **Design quality** — cards are the app's outward face; keep the visual
   language consistent (see existing cards for tone).

Inclusion is curated, not an endorsement: community plugins install disabled
and only an instance's owner turns them on.
