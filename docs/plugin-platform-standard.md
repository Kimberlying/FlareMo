# FlareMo 插件平台规范 v2（分享卡片模板 = 第一个槽位）

> 状态：**提案稿 v2（2026-09-18）**。取代同文件 v1 稿；按 09-18 决策收口：插件平台现在就做、模板系统作为插件系统的子集、目录镜像走官网、钉版本手动更新。代码未动，待开工。
> 关联：`docs/flomo-alignment-ux-refinement.md`（设计意图）、`apps/web/src/components/share-image-dialog.tsx`（现状）、PR #137（在途卡片重做）。

## 0. 结论摘要（本轮三个问题）

**① Memos 有插件系统吗？——没有，但有三条可学的。**
- 现状：Memos 无进程内插件/扩展系统（GitHub 全库检索「plugin」仅命中依赖升级与一条宽泛的功能提案）；它的扩展面是 **REST/gRPC API + Personal Access Token + Webhook**，生态长在外部客户端上（官方 Chrome 剪藏扩展、Obsidian 的 memos-sync / Memos Plus、浏览器助手等）。
- 学习点一：**生态靠稳定 API + 数据可移植生长**，不是靠宿主内跑第三方代码。我们的 Memos 兼容面继续当外部生态的接口，插件的资产与 API 全部走**自有命名空间**（`/api/app/plugins/…`），不污染兼容契约。
- 学习点二：**Webhook 是「服务端扩展」的最小安全形态**（Memos 的做法：事件外发 + `whsec_` 密钥 + HMAC-SHA256 签名 + 时间戳/去重 + 私网目标默认拒绝）。对应到我们：v1 明确**不在 worker 里执行第三方代码**；要服务端自动化就照这个模式做事件外发（工程可后置）。
- 学习点三：Memos 没有先例可抄，也没有生态惯性挡路——进程内插件平台是我们的**差异化能力**；而 Obsidian 的经验说明，社区能不能长起来取决于**作者工具链**（脚手架 / 校验器 / 发布流程），这部分不是可选项。

**② 模板系统可以是完整插件系统的子集吗？——可以，而且应该从第一天就按子集来建。**
模板 = 插件平台「分享卡片」槽位（slot）的贡献（contribution）。包格式、清单、校验、安装、沙箱、商店、版本管理**全部共用**；「模板」不是一个平行系统，而是第一个槽位类型。将来扩槽（笔记动作、编辑器命令、导出格式……）是纯加法：不动已装插件、不动模板作者写的包。

**③ 现在就把插件系统做上吗？——做「平台内核 + 第一个槽位」，不铺全槽位。**
插件平台的价值约九成不在槽位数量，而在：包/清单标准、沙箱运行时、安装/启用/商店管道、校验器。这些一次建成，槽位只是注册表里的增量。因此把原路线 P0 与 P4 合并为「现在就做」：**P0 交付平台内核 + 分享卡片槽位（document 与 sandbox 两种形态都在）**；其余槽位留给后续规范版本。

## 1. 目标与原则

1. **一次建成**：插件平台内核（包/清单/运行时/信任）与第一个槽位同期落地，避免「模板专用系统」二次重写。
2. **文件夹即插件**：仓内新增插件 = 新增一个目录（`plugin.json` + 资产），构建期自动发现，不改核心代码。
3. **定制化少限制**：`document`（JSON 排版文档，数据、零代码）与 `sandbox`（自由 HTML/CSS/JS，沙箱内全能力）两档，按作者能力自选。
4. **默认安全**：沙箱唯一硬约束 = 无网络、自包含；实例管理员显式安装并启用之前，任何非官方插件都不出现在用户界面。
5. **数据最小化**：插件只收到「当前操作所必需」的数据，且只在用户显式触发时收到（§4.5）。
6. **服务端不执行第三方代码**：服务端只做存储、分发、启停与策略；所有插件代码都在浏览器沙箱里跑（§4.6）。
7. **开放标准**：清单字段、槽位契约、校验器、目录协议全部文档化并版本化（`specVersion`）；官方目录只是默认目录源，任何人都能自建目录源。

## 2. 业界先例

| 系统 | 机制 | 借鉴点 |
|---|---|---|
| **Memos** | 无插件系统；API + PAT + Webhook（签名/去重/私网拒绝） | 服务端扩展的最小安全形态；生态靠 API；兼容面不被插件污染 |
| **Ghost** | 主题 = 文件夹 + `package.json`；后台上传 zip；上传时自动校验（GScan），致命错误拒绝启用；官方市场 | 「文件夹即包」「上传时校验」「校验器 CLI」「目录收录」 |
| **Obsidian** | 目录 = 仓库内 JSON 索引；插件 = `manifest.json` + `main.js` + `versions.json`（minAppVersion 兼容表）；产物挂在 GitHub Release | 索引与产物分离；兼容表；目录仓库 PR 制；作者工具链决定生态 |
| **Figma** | 双世界：主线程沙箱（无浏览器 API）+ UI iframe（无宿主 API），postMessage 通信；网络域名需在清单声明否则 CSP 拦截 | 「沙箱 + 消息桥 + 清单声明能力」= 本平台运行时原型 |
| **shadcn registry** | 分发物是 JSON 描述（文件/依赖/cssVars/版本）；命名空间 `@ns/item`；tag/commit 钉版本 | 目录条目字段；命名空间；版本钉法 |
| **Adaptive Cards** | 声明式卡片 JSON + version 字段，宿主渲染；宿主能力差异靠版本协商 | document 形态的兼容哲学 |
| **WordPress** | 主题/插件即任意 PHP，历史漏洞重灾区 | 为什么代码必须进沙箱、为什么不允许在应用域直接执行 |

## 3. 关键技术实测（2026-09-18，真实 Chromium）

在本地实例真实页面完成三项验证（WebBridge 驱动，可复现）：

1. **沙箱导出可行**：`<iframe sandbox="allow-scripts">`（不透明源）+ 文档内 CSP `default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; script-src 'unsafe-inline'` 下，DOM → `foreignObject` 序列化 → `data:` 图 → canvas → `toDataURL('image/png')` 成功；画布未被污染（无 SecurityError），背景像素逐位正确（`rgb(246,240,229)` = 卡片底色）；PNG 经 `postMessage` 回传宿主正常。
2. **XHTML 命名空间细节**：foreignObject 内元素需显式 `xmlns="http://www.w3.org/1999/xhtml"` 才渲染（首测透明、补上后正确）。这正是 html-to-image 内部所做的处理——宿主桥接会代劳，插件作者无感。
3. **网络外泄被阻断**：同一沙箱内三种外联全部被 CSP 拦截——`fetch` → TypeError、`new Image()` 外链 → 加载失败、同步 `XMLHttpRequest` → NetworkError。

结论：「自由写代码的插件」与「拿不到用户数据出路的沙箱」可以同时成立——这是本平台的基石。

## 4. 平台核心

### 4.1 包格式

分发载体统一为 **zip 包**：

```
<plugin-id>/
  plugin.json            ← 清单（必需）
  preview.png            ← 插件级预览（目录卡片用；≤512KB）
  cards/…                ← 内容与资产（document JSON、沙箱入口与资源、图片、字体）
```

仓内插件（`plugins/official|community/<id>/`）与商店安装的 zip **同构**：同一清单、同一布局；区别只在来源与打包时机（§8）。

### 4.2 清单 `plugin.json`

```jsonc
{
  "specVersion": 1,                    // 平台标准版本（整数）
  "id": "flaremo-cards",               // ^[a-z0-9][a-z0-9-]{0,63}$，全局唯一
  "version": "1.0.0",                  // 插件自身 semver
  "name": { "zh-CN": "基础卡", "en-US": "Basic Cards" },   // 多语言表；回退 当前→en-US→首键
  "description": { "zh-CN": "素白、票根、明信片三张基础卡。" },  // 可选
  "author": { "name": "FlareMo", "url": "…", "email": "…" },  // 社区插件必填
  "license": "AGPL-3.0-only",          // SPDX；缺省视为 AGPL-3.0-only
  "minAppVersion": "0.21.0",           // 可选；低于则标记「需升级」且不可启用
  "contributes": {                     // 贡献点：槽位 → 贡献列表（v1 仅一种槽位）
    "shareCardTemplates": [ … ]        // 见 §5
  }
}
```

规则：`contributes` 中出现的槽位类型必须是**该应用版本已实现**的；未知槽位忽略并在管理端标注「需要更新应用」。同一插件可贡献多个模板。

### 4.3 槽位与贡献模型

- **槽位（slot）**是宿主暴露的扩展点，每个槽位有自己的贡献 schema；**平台机制**（包/清单/校验/安装/沙箱/商店）与槽位无关。
- **v1 实现且仅实现 `shareCardTemplates` 一个槽位**（分享卡片模板，见 §5）。
- **未来槽位**（不实现、不承诺，仅登记方向）：`memoActions`（笔记动作）、`composerCommands`（编辑器命令）、`exportFormats`（导出格式）、`themePacks`（主题包）。新增槽位必须走规范版本演进（`specVersion` 递增），宿主对未知槽位一律忽略并提示升级。
- 宿主内部结构：`slot registry`（内置渲染器/沙箱宿主按槽位注册）→ `plugin registry`（发现/安装的插件与贡献合并）→ `instance config`（启用/排序/选项，§6）。分享卡片选择器 = 「已启用插件贡献 ∩ 实例配置」。

### 4.4 运行时

- **两种贡献形态**（同属分享卡片槽位，v1 全支持）：
  - `kind: "document"`：纯 JSON 排版文档（§5.1），**由核心渲染器在应用内直接渲染**，不进沙箱（数据即安全）。
  - `kind: "sandbox"`：自包含 HTML 入口（§5.2），在 `sandbox="allow-scripts"` 的不透明源 iframe 里自由渲染；宿主注入强制 CSP 与桥接脚本。
- **来源双轨**：`bundled`（随应用构建打包；仓内官方/社区插件）与 `store`（安装后存 R2，运行时取回）。**同一入口形态**：`store` 插件的 HTML 取回后与 `bundled` 一样经 `srcdoc` 写入沙箱。
- **桥协议 `bridge: 1`**（postMessage，命名空间 `flaremo:`；槽位规格见 §5.2）：`init → ready`、`update`（数据/选项/明暗变化）、`export → exported`、`error`。超时与限额：装载 8s、导出 10s、PNG ≤12MB、失败显示占位不阻塞对话框。
- **懒加载**：沙箱 iframe 仅在用户选中该模板时创建；`document` 渲染无额外开销。

### 4.5 信任与隐私模型

- **能力边界（沙箱内）**：无网络（CSP 强制，实测三通道全断）、无宿主 DOM/存储（不透明源；localStorage/cookie 天然不可用）、无文件系统。可利用的只有渲染能力与本槽位的消息数据。
- **数据流向**：宿主 → 插件 = `{正文纯文本, 日期, 日号, 统计行, 语言, 明暗, 品牌（产品名/标志 URL）, 实例选项}`——**仅当前卡面所必需**，且仅在用户打开分享面板/导出时传递；无后台数据流。
- **信任层级**：官方（随应用内置/官方维护）＞ 社区（仓库 PR 评审收录）＞ 本地（管理员上传，仅本实例）＞ 自定义目录源（未背书）。管理与安装界面必须标注来源，并明确「收录 ≠ 官方背书」。
- **管理端即信任决策**：安装与启用是实例管理员的动作；用户端不存在「自装插件」入口，只能在已启用集合内选择模板。
- **纵深防御**：即使有插件绕过前端假设，服务端对所有插件资产响应强制 `Content-Security-Policy: sandbox; default-src 'none'` + `X-Content-Type-Options: nosniff`（§4.6），直接打开插件 URL 也无法在应用域执行。

### 4.6 服务端职责与边界

- **做**：插件资产的存储（R2，`plugins/<id>/<version>/…`）、安装/启停/版本记录（settings KV，`flaremo.instance.PLUGINS`）、资源分发（带上述 CSP/nosniff 响应头、版本化路径 + immutable 缓存）、安装时的 sha256 校验与解包。
- **不做（v1 明确排除）**：不在 worker 内执行任何第三方代码、不提供服务端插件 API。服务端自动化需求由「API token + webhook 事件外发」承接（对照 Memos 的成熟形态，工程可后置）。
- **兼容面隔离**：插件相关路由全部在 `/api/app/plugins/…` 自有命名空间；Memos 兼容面（current/Connect/MCP）保持零接触。

## 5. 分享卡片槽位规格（v1）

槽位契约：贡献项声明 `id / kind / name / preview / size / options`；画布固定 `size`（200–1200px，缺省 340×420），导出按 2× 渲染 PNG。宿主传入的渲染数据统一为：

```ts
{ body: string, date: string, day: string, stats: string, locale: string,
  mode: "light" | "dark",
  brand: { product: string, markLight: string | null, markDark: string | null },
  options: Record<string, string | number | boolean> }
```

### 5.1 `kind: "document"`（JSON 排版文档）

由核心渲染器（React）解释执行。设计哲学：不造布局引擎，映射到 DOM 让浏览器做排版。

```jsonc
{
  "specVersion": 1,
  "root": {
    "type": "column",
    "style": { "padding": 28, "gap": 16, "background": "#f6f0e5", "height": "100%" },
    "children": [
      { "type": "row", "style": { "justify": "space-between", "font": { "size": 11, "uppercase": true, "letterSpacing": 2, "color": "#7d7468" } },
        "children": [
          { "type": "text", "text": { "zh-CN": "记忆便签", "en-US": "MEMORY NOTE" } },
          { "type": "text", "text": "{date}" } ] },
      { "type": "text", "text": "{body}", "style": { "flex": 1, "font": { "family": "serif", "size": 15, "lineHeight": 1.9 }, "clamp": 12 } },
      { "type": "divider", "style": { "color": "#d4c7b4" } },
      { "type": "row", "style": { "justify": "space-between", "font": { "size": 9, "color": "brand.600" } },
        "children": [ { "type": "text", "text": "{stats}" }, { "type": "text", "text": "{brand.product}" } ] }
    ]
  }
}
```

- **节点**：`row` / `column`（flex 容器）、`text`、`image`、`svg`（元素白名单：path/circle/rect/line/g/defs/渐变/滤镜 feTurbulence/feDisplacementMap/feGaussianBlur 等；禁 foreignObject/script/事件属性）、`divider`、`spacer`。
- **样式**：布局（padding/margin/gap/width/height/flex/align/justify/absolute 四边）；外观（纯色或 CSS 渐变背景、border、圆角、shadow 档位、opacity、rotate）；文字（family `sans|serif|mono|自定义`、size/weight/lineHeight/letterSpacing/align/uppercase/color、clamp 行数截断）。
- **颜色**：任意 `#rrggbb(aa)` 或**实例主题 token**：`brand.50…950`、`brand.coral`、`ink`、`paper`、`muted`——模板写 `"color": "brand.600"` 即自动跟随实例换肤。
- **绑定**：`{body} {date} {day} {stats} {locale} {brand.product} {brand.markLight} {brand.markDark}`，文本内可混排；卡片内固定文案写多语言表。
- **字体**：`cards/assets/*.woff2`（≤2 个、每个 ≤400KB），清单登记后由宿主注入 `@font-face`。
- **兼容**：未知节点/样式跳过并忽略；`specVersion` 超限或 `minAppVersion` 不满足 → 可安装但「启用」置灰并提示升级。

### 5.2 `kind: "sandbox"`（沙箱插件）

- **入口**：`cards/<id>/index.html`，自包含（资源内联或同目录相对引用），**零网络**。
- **宿主注入**（插件不可覆盖）：CSP meta + 桥接脚本 `window.FlareMo = { ready(), export(cb), onUpdate(cb) }`。
- **消息表**（`bridge: 1`）：

| 方向 | 消息 | 载荷 |
|---|---|---|
| host→plugin | `init` | `{ bridge, contribution: {id,size,options}, data, mode }` |
| plugin→host | `ready` / `rendered` / `error` | `{}` / `{}` / `{message}` |
| host→plugin | `update` | `{ data?, options?, mode? }` |
| host→plugin | `export` | `{ requestId }` |
| plugin→host | `exported` | `{ requestId, png: dataUrl }` |

- **导出**：插件侧自行序列化（DOM→canvas 需按 §3.2 处理命名空间；或直接 canvas 绘制）；宿主负责超时/限额/失败兜底。
- **明暗**：宿主传 `mode`，沙箱内自行适配（拿不到宿主 DOM）。

## 6. 实例配置与接口

存储：owner 行的通用 KV，新键 `flaremo.instance.PLUGINS`：

```jsonc
{
  "installed": [ { "id": "kosx-pack", "version": "1.0.0", "source": "store" } ],
  "enabled": ["flaremo-cards", "kosx-pack"],
  "shareCards": {
    "order": ["ticket", "plain", "postcard", "kosx-editorial"],
    "default": "plain",
    "hidden": [],
    "options": { "ticket": { "showStats": true } }
  }
}
```

- **缺省**：官方 bundled 插件默认启用；社区/商店/本地默认不启用；`shareCards` 缺省 = 已启用插件的全部贡献按 registry 顺序，默认第一项。管理员把一切隐藏时回落缺省（用户永远至少一张卡）。
- **归一化（服务端）**：`id` 形状校验；数组去重、上限 50；`default` 必须可见，否则回落第一项；`options` 仅原始值、单实例总量 <8KB；未知 id 宽容（服务端持形状不持清单）。
- **接口**：`GET/PUT /api/app/admin/plugins`（owner-only，写安装/启用/配置）；`GET /api/app/plugins`（匿名只读，返回「启用集合的贡献清单 + 品牌 + 选项」，供对话框懒取，staleTime 5 分钟，失败回落内置缺省）。
- **管理端 UI**：设置里的「插件」面板——已装列表（来源/版本/启用开关/卸载）、分享卡片区（贡献列表：勾选/拖拽排序/设默认/选项表单）、商店入口（§7）、上传入口（§7.2）。

## 7. 商店与目录协议

### 7.1 目录索引 `registry.json`

官方目录由公开仓 `plugins/` 生成（CI），**镜像发布到官网** `https://flaremo.app/plugins/registry.json`；实例默认内置官方源（官网地址 + GitHub 原始地址双备）。

```jsonc
{
  "specVersion": 1,
  "name": "FlareMo 官方目录",
  "updatedAt": "2026-09-18T00:00:00Z",
  "plugins": [
    {
      "id": "kosx-pack", "version": "1.0.0", "tier": "community",
      "name": { "zh-CN": "KOSX 品牌卡" },
      "author": { "name": "…" }, "license": "MIT",
      "preview": "kosx-pack/preview.png",
      "contributes": { "shareCardTemplates": [ { "id": "kosx-editorial", "kind": "sandbox" } ] },
      "artifact": { "url": "kosx-pack/kosx-pack-1.0.0.zip", "sha256": "…", "size": 81234 },
      "addedAt": "2026-09-18"
    }
  ]
}
```

- 相对 URL 以 registry 自身地址解析；跨域要求 CORS。
- **自定义目录源**：实例设置可增删目录（名称 + URL），协议相同——官方目录只是默认源，这是「开放标准」的完整形态。
- 商店 UI 按贡献类型分组（v1 只有「分享卡片」一类），标注 tier、作者、体积、版本与更新状态。

### 7.2 生命周期

1. **浏览**：管理端拉索引，卡片展示（预览图/名称/作者/tier/体积/贡献摘要）。
2. **安装**：下载 → sha256 校验 → 校验器检查（§9）→ 解包（worker 侧新增 `fflate`，仓库当前无 zip 依赖）→ 写 R2 `plugins/<id>/<version>/…` → 登记 `installed`（默认不启用）。
3. **启用**：管理员显式开启后才进入用户端选择器。
4. **更新**：目录版本 > 已装版本时显示「可更新」；**钉版本、手动升级**（自动更新开关留作后续可选）。
5. **卸载**：删 R2 文件 + 清设置；正在启用的模板即时移出选择器（用户无感降级）。
6. **上传本地插件**：zip 上传 → 同一校验器 → 落 R2（`source: "local"`），仅本实例可见，永不上传第三方。
7. **提交到目录**：本地插件一键导出 zip + PR 指引（放 `plugins/community/<id>/` 提 PR），收录后所有实例可安装。

## 8. 仓库布局

```
plugins/
  README.md                  ← 贡献指南（怎么写插件、怎么提 PR、评审标准）
  registry.json              ← 目录索引（生成物，随发布更新）
  src/                       ← 平台 TS（源码直出）：spec 类型 / registry 加载 / 校验核心
  official/
    flaremo-cards/           ← 官方插件：素白 / 票根 / 明信片（document）
  community/
    kosx-pack/               ← 社区/品牌插件（默认关闭；KOSX 卡的归宿）
  starter/                   ← 脚手架（document / sandbox 两种起手模板）
  tooling 由根 scripts/ 承载（plugin:check / plugin:new / plugins:build）
```

- `plugins/` 为源码直出 workspace 包 `@flaremo/plugins`（`main/types: ./src/index.ts`，与 `packages/*` 同款，无构建耦合）；`src/` 用 `import.meta.glob` 构建期发现仓内插件（文件夹即插件）。
- **bundled 与 store 同构**：仓内插件随应用打包（document JSON 打包；sandbox 入口以 raw 资源打包，运行时 `srcdoc`）；商店插件取回后同一路径运行。
- 工程接线（已核实）：`pnpm-workspace.yaml` 增 `plugins`；根 `package.json` 的 check/typecheck 过滤器、lint 目录表；`biome.json` includes；`vitest.config.ts` 覆盖 include；根 `tsconfig.json` references；`apps/web/src/index.css` 增 `@source "../../../plugins"`（Tailwind v4 扫仓外源码）。web 编译选项（`verbatimModuleSyntax` / `erasableSyntaxOnly`）对插件源生效。
- 官网镜像：`apps/site` 构建时把 `plugins/registry.json` 与包产物同步进站点输出（flaremo-site 部署带上 `/plugins/` 路径）。

## 9. 校验器与工具链

- **`pnpm plugin:check <dir|zip>`**：清单字段、id 形状、资源完整性、大小限额、document 节点白名单、sandbox 自包含性（无外链）、preview 尺寸——对位 Ghost 的 GScan；CI 在 `plugins/**` PR 上自动跑；实例上传时跑**同一套**逻辑（双端一致）。
- **`pnpm plugin:new <id>`**：脚手架（document / sandbox 两种起手 + 注释）。
- **`pnpm plugins:build`**：扫描 `plugins/{official,community}/*/`，逐包产出 zip + sha256 + 汇总 `registry.json`（供仓库提交与官网镜像）。
- 限额（校验器强制）：插件包 zip ≤4MB；插件级 preview ≤512KB；单字体 ≤400KB×2；单实例 options <8KB。

## 10. 路线图

| 阶段 | 内容 | 规模 |
|---|---|---|
| **P0 平台内核 + 分享卡片槽位** | `plugins/` 包（spec/registry/校验核心）、官方三卡转 document、对话框数据驱动、sandbox 运行时（宿主 + 桥 + 导出回传/超时兜底）、内置示例、工程接线、定向单测 | 4–6d |
| **P1 实例管理** | `flaremo.instance.PLUGINS` + admin GET/PUT + 公开端点 + 管理端「插件」面板（启用/排序/默认/选项）+ 8 语言 | 1.5–2d |
| **P2 商店** | registry 生成 + 官网镜像 + 商店 UI（浏览/安装/更新/卸载）+ R2 存储 + 服务端 CSP sandbox 头 + sha256 | 2–3d |
| **P3 上传与创作** | zip 上传（本地插件）+ 校验器双端 + starter + 导出/提交 PR + 贡献指南 | 1.5–2d |
| **P4+ 更多槽位** | 每新增槽位走独立规范版本（如 `memoActions`、`composerCommands`） | 按需 |

P0/P1 完成后即可滚 kosx（用户无感，管理员可用插件面板）；P2 起商店可用；KOSX 卡在 P0 骨架落地后放入 `community/kosx-pack/`（默认关闭），P1 起管理员可自行启用。

## 11. 决策记录（2026-09-18）

1. **目录镜像**：官网发布（`flaremo.app/plugins/`），随 `apps/site` 部署产出。
2. **更新策略**：钉版本 + 手动更新（自动更新后续按需再加）。
3. **包体上限**：插件包 ≤4MB / 预览 ≤512KB / 字体 ≤400KB×2 / 选项 <8KB。
4. **插件平台现在就做**：平台内核 + 分享卡片槽位同期落地（原 P0/P4 合并）；其余槽位后续规范版本。
5. **服务端不执行第三方代码**：v1 明确排除；服务端自动化走 API/webhook 模式（工程可后置）。
6. **默认策略**：官方默认启用；社区/品牌/商店插件默认关闭，管理员显式启用。
7. **沙箱唯一硬约束**：无网络、自包含（隐私红线，非表达限制）。
8. **PR #137 处置**：通用设计（票根/明信片）在 P0 以 document 归 `official/`；KOSX 卡入 `community/kosx-pack/`（sandbox，默认关闭）。

## 12. 开放问题（剩余）

1. **槽位演进治理**：新增槽位的开启标准（建议：首个真实需求 + 决策稿 + `specVersion` 递增）。
2. **插件作者本地预览页**（devtools 型，便于调试）：建议 P3 附带，非阻塞。
3. **团队成员级开关**（非管理员自行隐藏某插件）：v1 不做，先记录。
4. **服务端事件外发（webhook）**：是否排期、何时做（对照 Memos 形态），与插件平台解耦，另行决策。
