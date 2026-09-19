# 图片上传前压缩 WebP 方案

状态：**已实施**（2026-09-19 拍板并当日实现合入；部署待检出中文章功能 WIP 收口后随常规发布）
日期：2026-09-19
范围：apps/web（上传管道 + 设置项）；**服务端零改动**
关联调研：09-19 会话；音频压缩另见 `docs/audio-compression-research.md`

---

## 1. 背景与定案

用户上传的图片以 PNG 截图和 JPEG 照片为主，体积大、占 R2 配额、移动端上传慢。方案：**上传前在浏览器内把图片转码为 WebP**（截图通常省 60–80%，照片省 25–35%），并在设置里给用户选择权：

> **设置项「图片压缩」**：开 = 上传前压成 WebP；关 = 一律原图直传。

定案原则：压缩是 best-effort 的"装饰"——任何一步失败都退回原图直传，**永远不阻塞上传**。这与 `uploadAttachment` 里已有的 `readImageDimensions` / `readAudioDuration` 哲学完全一致。

## 2. 现状链路（代码事实）

所有图片入口汇入同一个函数 `uploadAttachment`（`apps/web/src/api/attachments.ts`）：

| 入口 | 位置 |
|---|---|
| 富文本编辑器粘贴 / 拖拽 | `rich-composer-editor.tsx:176` / `:183` |
| 文件选择 | `memo-composer.tsx:175` |
| PWA 快速记录页 | `capture-page.tsx:96` |
| 移动端待传队列 | `memo-submission.ts:28` |

服务端 `POST /attachments`（`apps/worker/src/routes/memos-api.ts:355`）：
- **无 MIME 白名单**，content-type 取文件自报 → WebP 无需任何服务端放行
- 大小上限 25 MiB（`attachment-http.ts:3`），压缩后只会更小
- 按 `client_id` 去重，与压缩无关
- 回显 inline 白名单**已含 `image/webp`**（`attachment-http.ts:11`）
- 客户端上报的 `width`/`height` 存进 payload 供渲染占位——压缩后量压缩产物即可自动正确

## 3. 压缩管线设计

在 `uploadAttachment` 内、读尺寸**之前**插入：

```
file → 设置关闭？──是──────────────────────► 原文件直传
        │否
        ↓
     是可压缩图片？（image/* 且不在 skip 名单）
        │否 → 原文件直传
        ↓
     createImageBitmap(file, { imageOrientation: "from-image" })
        ↓
     长边 > 2560px → 分步降采样至 2560（减半迭代 + 精缩，避开 iOS canvas 16.7MP 上限）
        ↓
     feature-detect 通过？→ canvas.toBlob("image/webp", 0.82)
        │不支持（Safari）/ 编码失败 / 结果反而更大
        ↓ 原文件直传
     压缩产物：改名 <原名>.webp → 走原有上传流程
```

### 3.1 跳过规则（skip 名单）

| 类型 | 理由 |
|---|---|
| `image/gif` | canvas 只取第一帧，动画丢失 |
| `image/svg+xml` | 栅格化直接毁掉矢量 |
| `image/avif`、`image/webp` | 已是高效格式，不二次有损 |
| 文件 < 100 KB | 收益不抵耗电与耗时 |
| 非 image/* | 音频另见音频方案；其余类型不碰 |

透明通道无需特判：WebP 支持 alpha。

### 3.2 参数

- **长边上限 2560px**：截图文字在 2x 屏可读；iPhone 12MP 照片（4032×3024）缩到 2560×1920 = 4.9MP，远离 iOS Safari 的 16.7MP canvas 硬上限（超限静默出空白图，必须靠缩放躲开）。
- **质量单趟 0.82**：不做多趟搜参（克制；要更小靠缩放而不是反复编码）。
- **EXIF 方向**：`imageOrientation: "from-image"` 烘进像素（Safari 支持度实现时真机验证，兜底走 `Image` 元素解码）。顺带**剥离 EXIF/GPS 元数据**——隐私加分项。
- **产物命名**：`photo.jpg` → `photo.webp`。R2 object key 与附件展示名都源自 `file.name`，改名即全局生效。

## 4. 设置项「图片压缩」

- **存储**：localStorage，与主题 / 语言偏好同模式（`theme-provider.tsx`、`i18n.tsx` 先例）。纯客户端偏好，**服务端零改动**；跨设备不同步（与主题/语言现状一致）。
- **UI 落点**：`AccountSettingsDialog`（`account-page.tsx:115`，用户菜单 `onOpenSettings` 打开）新增一行开关：标题「图片压缩」+ 一句说明（"上传前将图片压缩为 WebP，关闭后上传原图"）。
- **i18n**：8 个语言文件（en-US / zh-CN / ja / ko / ru / fr / es / ar）各加 2–3 条文案，走 `TranslationKey` 类型强制对齐。
- **默认值**：建议**默认开**（大多数用户受益；关掉只影响该设备浏览器）。
- **生效范围**：web 应用全部入口（收口点单一，自动全覆盖）。Memos 兼容 API / 第三方客户端不经 web 应用，不受影响——它们的原图服务端转码兜底是二期方向，不在本方案。

## 5. Safari 与兼容性策略

- Safari 至今（2026）**不支持** `canvas.toBlob('image/webp')`，且会**静默回退成 PNG**——不能靠 try/catch，必须 feature-detect：`canvas.toDataURL('image/webp').startsWith('data:image/webp')`。
- **v1**：检测不支持 → 直接原图直传。零新依赖。
- **v2 可选**：懒加载 `@jsquash/webp`（wasm 约 100–500KB，动态 import 不进主包）补齐 Safari，保持全平台统一 WebP。独立增量，不阻塞 v1 上线。
- WebP **解码**全现代浏览器支持（Safari 14+），存储侧无兼容风险。

## 6. 测试与验收

- 定向 vitest（`uploadAttachment` 管线）：skip 矩阵（gif/svg/avif/webp/小图）、产物改名、宽高取压缩后值、编码失败回退原图、结果更大回退原图、设置关闭直传。canvas / createImageBitmap 全 mock。
- **e2e 注意**：`attachment-inline.spec.ts` 跑在 Chromium 里，测试上传的 PNG 会被真压成 webp，涉及 content-type / 文件名断言处需跟着调。按仓库惯例 e2e 只在 Kim 明确要求时跑。
- 真机清单：iOS Safari 粘贴截图（方向、压缩生效）、Safari 开关两态、Android Chrome 体积对比。
- 惯例门禁：tsc + 定向 vitest + `pnpm --filter @flaremo/web build` + dev 目检。

## 7. 明确不做的事

- 不动 gif / svg / avif / favicon（favicon 走独立端点 `POST /admin/branding/favicon`，本就支持 webp）。
- 不做多趟质量搜参、不存原图+WebP 双份（单资产，克制）、不加压缩进度 UI（本地同步完成，通常亚秒）。
- 服务端一行不改；不做同步服务端转码（免费版 Workers CPU 10ms 不够 + 128MB 内存 OOM 风险，已另评估）。

## 8. 工作量

| 阶段 | 内容 | 估算 |
|---|---|---|
| v1 | 管线 + 设置项 + 8 语言文案 + 单测 | 约半天 |
| v2（可选） | @jsquash/webp 懒加载补 Safari | 约半天 |

## 9. 决策记录

1. **默认值**：默认开（两个开关均默认开，localStorage 可关）。
2. **v2 Safari wasm 兜底**：暂不排期；v1 Safari 检测到不支持编码即原图直传。
3. **`toBlob` 超时兜底（审计补充）**：`canvas.toBlob` 在极端情况下（画布被污染、上下文丢失）可能永不回调，await 会卡死整个上传——加 10s 计时器，超时按编码失败处理、原图直传。
4. **对象 URL 生命周期（审计补充）**：`<img>` 的 blob URL 只在 drawImage 之后的收尾处 revoke，不再在 decode 完就 revoke——后者在内存紧张时会抽走解码数据、让 drawImage 画成空白。

## 10. 审计修正（2026-09-19，实现后复核）

提交 `30eb21c` 后逐行审计，发现并修掉三处：`toBlob` 无超时（可卡死上传）、原图对象 URL 过早 revoke（潜在空白图）、音频侧缺回放/内存门禁与文案不准确（详见 `docs/audio-compression-research.md` §6）。图片侧的 skip 规则、2560px 长边、q0.82、`<img>` 优先解码（EXIF）经复核无需改动。另在播放器修掉一处与本功能相关的显示 bug：Ogg 流时长未知时 `duration` 为 `Infinity`，`formatClock` 会渲染成 `Infinity:NaN:NaN`（`reading-audio-provider.tsx` 现按 0 处理）。测试从 17 例增至 24 例。
