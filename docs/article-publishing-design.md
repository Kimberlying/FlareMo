# 文章功能调研报告（成熟第三方框架优先）

- 日期：2026-09-19（v2，重写自 09-18 设计稿）
- 状态：**P0 + P1 已实施并交付**（2026-09-19 同日实施：articles 迁移 0029、worker SSR/兼容 API、web 编辑器与列表、i18n 8 语言、253 worker + 368 web + 13 domain 测试全绿；P2 按需后置）。调研结论保持有效，正文未回改。方向已按推荐定案（见 §3.1），本轮报告回答的核心问题是：**每一层有没有成熟第三方框架？有，就按成熟框架做完整集成；没有，才允许应用层胶水。**
- 前置事实：2026-09-18 已完成现状审计——FlareMo 无文章形态（无标题/无草稿/无 slug/无公开发布面），分享 token 是刻意不可枚举设计与文章"可收录"契约相反；渲染底座（react-markdown / marked / TipTap 3 / share-page SSR 基建 / TOC 设施）大半现成。**发布链路是新活，渲染是大半现成。**

---

## 0. 结论摘要

1. **除了"数据模型和权限接线"这一个应用层环节，文章功能的每一层都有成熟第三方框架**，且全部可以完整集成：编辑器（TipTap 官方扩展）、Markdown 渲染（unified/remark-rehype 插件生态 + marked 官方扩展包）、代码高亮（Shiki，JS 引擎可跑 Workers 已核实）、目录/锚点（remark-toc / rehype-slug / marked-gfm-heading-id）、RSS/sitemap（feed / sitemap 包）、JSON-LD（schema-dts）、OG 图（satori 系）。**不需要手搓任何解析、渲染或生成逻辑。**
2. **唯一的"整框架"（CMS 级）候选是 Payload 3**——2025-09 起官方支持 Cloudflare Workers + D1 + R2（Cloudflare 官方博客背书）。正面评估后结论是**不引入**（§4 路线对比）：它是 Next.js 整站应用，带不进 FlareMo 的 Hono + SPA 架构，引入等于为文章功能养第二套系统，内容主权和体验一致性双输。作为路线 B 留档。
3. 修正上一版方案里的两处"隐性手搓"，换成成熟件：SSR 侧标题锚点改用 **marked 官方扩展 `marked-gfm-heading-id`**；web 侧锚点/外链/目录改用 **rehype-slug / rehype-autolink-headings / remark-toc**，替代自研 slugger 的扩展位（现有自研件保留兼容，新文章面一律走成熟插件）。
4. 剩余无法外包给框架的工作只有三样，**全是应用代码而非轮子**：articles 表与现有权限/空间模型的接线、SSR 公开页模板（share-page 同款 ~40 行 CSS 的呈现层）、附件匿名访问契约的复用。

## 1. 现状与缺口（审计结论压缩版）

| 层 | 现状 | 缺口 |
|---|---|---|
| 编写 | TipTap 3.31 WYSIWYG + `@tiptap/markdown`（存储纯 Markdown），composer 是短记录框 | 无标题/长文编辑面/草稿态/发布对话框 |
| 渲染（web） | react-markdown 10 + remark-gfm 4；自研 heading slugger、自研 outline 提取 | 无代码高亮、无脚注/公式；TOC 被"仅音频"条件挡住 |
| 渲染（SSR） | marked + GFM（share-page.ts），与 web 侧 parity 测试对齐 | 无高亮；标题锚点无 id；JSON-LD 用 `SocialMediaPosting`；标题取正文截断；og:locale 硬编码 |
| 发布 | `/share/:token` 单条弱公开，token 不可枚举，sitemap 404 | 无 slug、无发布状态、无可收录公开页 |
| SEO 基建 | meta/OG/Twitter/JSON-LD/canonical 全套已有（分享页） | 文章页缺 sitemap/RSS/BlogPosting |

## 2. 成熟框架盘点（按层）

### 2.1 整框架（CMS 级）——只有 Payload 3 值得正评

| 候选 | 与 FlareMo 架构的关系 | 判定 |
|---|---|---|
| **Payload 3** | **唯一官方跑在 Cloudflare Workers + D1 + R2 的开源 CMS**（2025-09 Cloudflare 官方移植博文 + 官方一键部署模板）。自带后台、编辑器、草稿/发布、媒体库、权限 | 详见 §4 路线 B：能跑，但它是 Next.js 整站应用，**带不进现有架构**，不引入 |
| Ghost / WordPress / Strapi / Directus | 需要 Node/PHP 常驻服务器，Workers 架构不可用 | 否 |
| Keystatic / TinaCMS / Decap | Git-based（内容存 Git 仓），与"D1 是唯一事实源"冲突 | 否 |
| Sanity / Contentful | 外部 SaaS，内容离开实例——与自部署定位直接冲突 | 否 |

### 2.2 编辑器

| 候选 | 成熟度 | 判定 |
|---|---|---|
| **TipTap 3（现用）** | ProseMirror 系事实标准，100+ 官方扩展；`@tiptap/markdown` 保证存储契约 | **保留，只加官方扩展**：`@tiptap/extension-table`、`@tiptap/extension-code-block-lowlight`（禁用 starter-kit 内置 CodeBlock 防重名）、CharacterCount。文章编辑面 = 标题输入框 + 全屏 TipTap |
| BlockNote | Notion 式块编辑，成熟；但输出自有块 JSON，纯 Markdown 存储契约下往返有损 | 否 |
| MDXEditor | markdown-first、Lexical 底座，成熟；但替换现用 TipTap 纯属 churn，无增量能力 | 否 |
| Milkdown | markdown-first、ProseMirror+remark，可替代但同上 | 否 |

### 2.3 Markdown 渲染 + 插件生态（本轮核心修正：用插件替换手搓）

**web 端（react-markdown，unified 生态）——不动内核，挂官方插件：**

| 需求 | 成熟插件 | 替代掉的自研/缺口 |
|---|---|---|
| 标题锚点 id | `rehype-slug` | 自研 `createSlugger` 的扩展位（现件保留给 memo 卡片，文章阅读面走 rehype-slug） |
| 标题自链接 | `rehype-autolink-headings` | 新能力 |
| 目录 | `remark-toc`（正文 `[TOC]` 占位自动生成） | 新能力；SPA 交互高亮目录继续用现成 `MemoOutline`（已是建成设施） |
| 代码高亮 | `@shikijs/rehype`（Shiki 官方包） | 缺口 |
| 脚注 | `remark-footnotes`（GFM 风格，remark-gfm 不含脚注） | 缺口 |
| 数学公式 | `remark-math` + `rehype-katex` | 缺口（P2 可选） |
| 外链安全 | `rehype-external-links`（自动 rel=noopener） | 手写 a 组件判断的替代位 |

**SSR 端（marked，官方扩展包）：**

| 需求 | 成熟包 |
|---|---|
| GFM 标题 id | `marked-gfm-heading-id`（markedjs 官方） |
| 代码高亮桥 | `marked-highlight`（官方，接 Shiki 自定义 highlighter，支持 async） |
| 现有安全行为 | 维持现实现（raw HTML 丢弃 + 不安全链接中和是 share-page 已验证的自定义 renderer，属于安全逻辑非轮子，保留） |

### 2.4 代码高亮

**Shiki**（唯一推荐）：VS Code 同源 TextMate 引擎；`createJavaScriptRegexEngine` 无 WASM、可跑 Cloudflare Workers、按语言注册控 bundle（已核实官方文档）；`@shikijs/rehype` 接 web、`marked-highlight` 接 SSR，两端同一套主题/语言配置。首期语言集合：ts/js/py/json/bash/html/css/rust/go + 纯文本兜底。编辑态用 TipTap 官方 `code-block-lowlight`（highlight.js 系，轻），阅读态 Shiki。

### 2.5 发布基建（RSS / sitemap / 结构化数据）

| 需求 | 成熟包 | 说明 |
|---|---|---|
| RSS/Atom | `feed`（jpmonette） | 一套模型同时出 RSS 2.0 / Atom / JSON Feed，Workers 兼容 |
| Sitemap | `sitemap`（Sitemap.js） | stream/字符串两种输出，XML 转义与 lastmod 规范不用自己管 |
| JSON-LD | `schema-dts`（Google 维护） | `BlogPosting` 类型完整 TS 类型，拼装不再手写对象字面量 |
| frontmatter | `gray-matter` | **不需要**——元数据在 D1 列里，Markdown 保持纯正文（列出仅备查） |

### 2.6 OG 图片自动生成（P2 可选）

`satori`（Vercel，JSX→SVG）系在 Workers 上有成熟封装：`@cloudflare/pages-plugin-vercel-og`（Cloudflare 官方插件）或 `workers-og`。已知坑（外部图片需先转 data URL）社区已有解法。P2 再装，不阻塞 P0/P1。

### 2.7 评论/互动（边界外，仅登记成熟件）

若未来要评论：`giscus`（GitHub Discussions 底座）是成熟且零后端的选项，与自部署定位兼容。当前明确不做（§8）。

## 3. 集成方案（成熟框架拼进 FlareMo）

### 3.1 已定案项（不再重复征询）

独立 `articles` 第三实体（concept-model 补决策记录）；公开 URL `/article/:slug`；**发布=完全公开+可收录**（产品首个可枚举公开级别）；团队文章首期不做（`teamId` 列预留，P2 整合）；Shiki 语言集合按 §2.4。

### 3.2 数据模型（应用层，唯一无法外包的环节）

`articles` 表：`id`（复用 `createResourceId`，新增 `articles` 前缀）、`userId`、`teamId?`、`slug`（唯一；标题 translit kebab + 冲突回退随机后缀；**发布后冻结**，canonical 稳定性）、`title`、`description?`、`content`（纯 Markdown）、`status(draft/published)`、`coverAttachmentId?`、`lang?`、`publishedAt?`、时间戳/软删三件套；索引对齐 memos 惯例（user_status_updated / slug 唯一 / publishedAt / 回收站清扫）。

**附件绑定**：现有 `attachments.memoId` 可空，孤儿附件 7 天被 cron 清扫。文章上传必须绑 `attachments.articleId`（新增可空列 + FK `ON DELETE SET NULL`），并把孤儿清扫谓词扩为"memoId 与 articleId 均空"。文章硬删时对其附件走 R2 清扫同款批处理。公开读面新增 `/api/public/articles/:slug/attachments/:id/blob`（校验：文章已发布 + 附件绑定该文章），镜像现有分享 blob 路由。

### 3.3 编写链路

`/articles`（列表：草稿/已发布）→ `/articles/new` 即建草稿行 → `/articles/:id/edit`：标题输入 + 全屏 TipTap（§2.2 扩展集，图片上传复用现有 `image-insert` 编排并绑 `articleId`）+ 2s debounce 自动保存 + 发布对话框（description/cover/slug 展示/公开确认）。

### 3.4 发布链路（worker）

`apps/worker/src/routes/article-page.ts`，复刻 share-page 基建（`run_worker_first: true` 已是全局布尔，新路径天然接住，部署后仍须实测 curl）：

- `GET /article/:slug`：零 JS SSR；draft/删除/不存在 → 404+noindex；marked + `marked-gfm-heading-id` + `marked-highlight`(Shiki)；meta/OG/Twitter 用文章 `title`/`description`/cover；JSON-LD 用 `schema-dts` 的 `BlogPosting`（顺手把 share-page 的 `SocialMediaPosting` 一并换掉）；og:locale 取文章 lang 或实例 locale，去硬编码。
- `GET /sitemap-articles.xml`：`sitemap` 包生成，仅 published + lastmod；`/sitemap.xml` 变 sitemapindex 指向它（分享 token 的不可枚举设计不动）。
- `GET /feed.xml`：`feed` 包生成 RSS 2.0（Atom/JSON Feed 同源免费送）。

### 3.5 渲染链路

SSR 高亮主题对齐 `.memo-markdown` 明暗双套 CSS 变量；TOC 放开 `memo-reading-view` 的"仅音频"限制（`MemoOutline` 自带 <2 条目隐藏）；web 端文章阅读面挂 §2.3 的 rehype/remark 插件集（memo 卡片渲染不受影响——插件按调用方选择性传入，Shiki chunk 懒加载）。

## 4. 路线对比（为什么是"组装"而不是"整框架"）

| | **路线 A：组装成熟框架（推荐）** | 路线 B：引入 Payload 3 | 路线 C：全手搓（否决） |
|---|---|---|---|
| 形态 | 7 个成熟库 + FlareMo 应用层接线 | 独立 Next.js CMS 子应用（同实例或子域） | 现方案各环节自写 |
| 新增依赖 | shiki、marked-gfm-heading-id、marked-highlight、remark/rehype 5 件、feed、sitemap、schema-dts、@tiptap/extension-table、code-block-lowlight | Payload 全家桶 + Next.js 运行时 + 独立部署单元 | 少量 npm 但代码面大 |
| 内容主权 | D1 单一事实源，权限/空间/i18n 全复用 | 内容在 Payload 自己的 schema/权限体系里，与 FlareMo 用户体系是两套 | 同 A |
| 体验一致性 | 编辑/阅读/权限与现有产品同源 | 两套 UI、两套账号语义、品牌对齐成本高 | 同 A |
| 维护面 | 每个库都是各自领域的标准件，社区维护 | 官方支持 Workers 但属新路线（2025-09 起），边界 bug 风险自担 | 全自担 |
| 工作量 | P0 2–3 天 + P1 1–2 天 | 部署 1 天，但对齐 FlareMo 体验是无底洞 | 显著大于 A |

**判定：路线 A。** Payload 3 是真正成熟的整框架且确实能跑在 Workers 上，但它解决的问题（从零建内容站）不是我们的问题（在既有产品内长出文章形态）。引入它的代价是把 FlareMo 变成两个系统。

## 5. 分期

| 期 | 内容 | 新装框架 |
|---|---|---|
| **P0 最小闭环**（2–3 天） | articles 表+迁移（attachments.articleId 同批）；编辑页（TipTap 官方扩展）+自动保存+发布对话框；SSR 文章页（marked-gfm-heading-id + schema-dts BlogPosting）；`/articles` 列表 | @tiptap/extension-table、code-block-lowlight、marked-gfm-heading-id、schema-dts |
| **P1 渲染与收录**（1–2 天） | Shiki 双侧（marked-highlight + @shikijs/rehype）；TOC 放开；rehype-slug/autolink/external-links 进文章阅读面；sitemap-articles.xml + feed.xml；share-page JSON-LD 顺手修正 | shiki、marked-highlight、@shikijs/rehype、remark-footnotes、rehype-slug、rehype-autolink-headings、rehype-external-links、feed、sitemap |
| **P2 可选** | satori OG 图、remark-math+rehype-katex、团队文章流整合、语义搜索接入 | workers-og 或 @cloudflare/pages-plugin-vercel-og、remark-math、rehype-katex |

门禁按既定约定：定向 vitest（articles 域层 + article-page SSR Miniflare 用例 + share/article parity）+ tsc + build + dev 目检；不跑 e2e、不跑全量 verify（除非 Kim 点名）。

## 6. 验收标准

```
1. curl /article/<已发布slug> → 200：<h1>=文章标题、BlogPosting JSON-LD、canonical、
   代码块带 Shiki 高亮 span、标题带 GFM id
2. curl /article/<草稿slug> 与不存在 slug → 404 + noindex（非 soft-404）
3. SSR 页 < 50KB（Shiki 按需语言注册后仍达标）、零 JS
4. /sitemap-articles.xml 仅含 published；/sitemap.xml 为合法 sitemapindex；/feed.xml 合法 RSS
5. 未登录浏览器访问与 curl 内容一致（run_worker_first 实测不回落 SPA 壳）
6. 编辑页刷新/断网草稿不丢；发布后 slug 冻结；改标题不影响 URL
7. 文章图片匿名可读（公开 blob 路由），草稿图片不进公开面
8. 文章删除后其附件被 GC 扫到（孤儿谓词含 articleId）
9. memo 时间线/卡片渲染零回归（插件选择性传入）
```

## 7. 风险与已知坑

1. **`run_worker_first`**：分享页的生产坑已记录在案（未列路径会被 SPA 壳顶掉）；现配置已是全局布尔，但每期部署后仍按 §6.5 实测。
2. **Shiki bundle**：SSR 侧按语言注册（每语言数十 KB，不进客户端）；web 侧必须懒加载 chunk，且仅文章/分享阅读面启用，否则拖累首屏。
3. **slug 算法迁移**：rehype-slug 与现有自研 slugger 的生成规则可能不同——文章面用新算法没问题，但 `MemoOutline`（现用自研）若日后迁到 rehype-slug，需同步迁移，避免锚点错位；两套并存期间各自自洽即可。
4. **marked 扩展顺序**：`marked-highlight` 要求在 parse 前注册且与 gfm-heading-id 无冲突，parity 测试覆盖（现有 share-page parity 套件直接扩展）。
5. **Payload 路线留档**：若未来做"独立内容门户"（脱离 FlareMo 应用的公开站），Payload 3 是首选再评估项。

## 8. 边界与明确不做

评论系统（giscus 已登记备查）、点赞/反应、文章系列/专栏、导航目录页、独立静态站（Astro/Hexo）、多语言文章内容、订阅推送、文章历史版本。FlareMo 定位仍是记录工具+团队知识库，**文章是从记录中长出的发表形态，不是博客平台**。

## 9. 补充项（2026-09-19 第二轮自查——与现有系统的接缝）

以下 8 项是初版报告遗漏的"文章诞生后要过日子"的接缝，均已并入分期：

1. **回收站 TTL 接线**：cron 的过期清扫目前只扫 memos/projects/tasks（`listExpiredTrashedMemos` 等）。文章软删后必须进同一 TTL 机制（`articles_recycle_sweep_idx` 已按此设计），否则回收站只进不出。归入 P0。
2. **限额与速率限制**：文章 CRUD 挂 `rateLimitGuard` 独立桶；文章内容长度上限（建议 200KB，对齐 limits.ts 的分级思路）——公开 SSR 页是匿名可打面，无限额会被刷爆 D1 读配额。归入 P0。
3. **RSS 全文输出**：`feed` 包输出全文（`content` 字段填渲染后 HTML 而非摘要）——全文 feed 是成熟惯例且对读者有用；SSR 端本就要渲染全文 HTML，无额外成本。
4. **缓存策略**：文章页 `cache-control: public, max-age=300, must-revalidate`（比分享页 60s 长——文章无"随时撤链"语义，下线走 404+短 TTL 自然收敛）；RSS/sitemap 用 1h。边缘缓存即可扛爬虫高频，无需自建限流。
5. **「记录 → 文章」桥**：**不做** checkbox→任务那样的单向门。文章与记录的差异是发表语义而非状态转换，硬造一道门会污染概念模型；P2 备选最低成本形态是"复制为文章草稿"（长 memo 一键复制成 draft，原文不动）。
6. **阅读统计**：不自建计数器（写路径污染 + D1 配额）；P2 用 Cloudflare Web Analytics（免费成熟，注入 SSR 页一段 script 即可）。
7. **导出**：`import-export` 目前不含文章。数据主权要求文章可带走，归入 P2（JSON 同款格式加 `articles` 数组）。
8. **Memos 兼容层**：文章**不进** `/api/v1` memos 兼容 API 与 MCP（上游 Memos 无此概念，塞进去会破坏兼容契约）；文章只有自有 `/api/app/articles` 面。已登记进 §8 边界。

另：§3.2 的 slug 生成定名用 `@sindresorhus/slugify` + `@sindresorhus/transliterate`（中文标题转拼音，已核实支持 CJK；纯中文 slug 回退随机后缀的兜底逻辑保留）。
