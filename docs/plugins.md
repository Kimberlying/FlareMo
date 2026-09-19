# 插件

FlareMo 通过**槽位（slot）**扩展：插件是一个文件夹——一份清单加上它引用的文件。加插件不改核心代码，应用在构建期自动发现，管理员决定启用哪些。

当前平台实现了一个槽位：**`shareCardTemplates`**——分享图片时可选用的卡片。平台机制（包、校验、商店、沙箱）与槽位无关，后续槽位走规范版本演进。

## 面向使用者（实例管理员）

### 内置与官方卡

开箱即有 4 张官方卡：**素白**、**日签**、**票根**、**明信片**，以及一张演示沙箱能力的**邮戳**（自绘 canvas）。官方卡默认启用，任何人分享笔记时都能选用。

### 从商店安装

**账户设置 → 插件 → 插件商店**：

1. **浏览**——列出所有已配置目录里的插件：名称、作者、来源标记、卡片缩略图、体积。
2. **安装**——下载 → 校验 sha256 → 解包 → 存入本实例的 R2；官方源默认指向 `https://flaremo.app/plugins/registry.json`。
3. **启用**——**安装不等于启用**：社区/商店插件装完是关闭的，只有你在插件列表里打开开关，用户才能看到它的卡片。
4. **更新**——目录里有更新版本时显示「更新到 vX」，点击即装（钉版本，不自动升级）。
5. **卸载**——删除该插件在本实例的全部资产与记录。

### 上传自己的插件

同一面板的**上传本地包**接受一个 zip。上传的插件**只存在于你自己的实例**，永不外传。适合内部卡、客户定制卡、或尚未提交到目录的实验品。

### 挑选与排序卡片

插件列表下方是卡片管理：**上移/下移**调整顺序、**星标**设为默认选中的卡、**眼睛**把某张卡从用户界面隐藏。带选项的卡（如邮戳的点缀色）在这里直接调参。

### 自定义目录

实例可以添加额外的目录源（同样的 registry 格式，需 https）。官方目录只是默认源——任何能托管 `registry.json` 的地方都能成为目录。

### 隐私与安全

插件卡片运行在**不透明源的沙箱 iframe** 里，并带强制 CSP：**没有任何网络访问能力**。卡片拿到的数据只有当前这条笔记的正文、日期、统计与实例品牌——这是「分享卡片」不回传数据的底线保证。

---

## 面向作者

完整指南见 [plugins/README.md](https://github.com/realchendahuang/FlareMo/blob/main/plugins/README.md)。快速路径：

```bash
pnpm plugin:new my-pack                  # 生成 plugins/community/my-pack
pnpm plugin:check plugins/community/my-pack
pnpm dev                                  # 打开分享弹窗实时预览
pnpm plugins:build                        # 产出 zip + sha256 + registry.json
```

### 两种卡片形态

| | **document** | **sandbox** |
| --- | --- | --- |
| 载体 | 一份 JSON 排版文档 | 自包含 HTML（HTML/CSS/JS 随意写） |
| 渲染 | 应用内直接渲染 | 不透明源 iframe 内自由渲染 |
| 能力 | 布局 / 文字 / 图片 / 内联 SVG / 渐变 / 主题 token | 无限制，含 canvas |
| 适合 | 绝大多数卡片、非开发者 | 特殊效果（手绘、滤镜、奇特排版） |

document 卡的完整参考见 [plugins/README.md 的节点与样式表](https://github.com/realchendahuang/FlareMo/blob/main/plugins/README.md#document-cards-json)；仓库里 [明信片卡](https://github.com/realchendahuang/FlareMo/blob/main/plugins/official/flaremo-cards/cards/postcard.json) 是 SVG 水彩的实战例子。

### 唯一硬约束

**无网络、自包含**。这不是限制表达力，是隐私红线：卡片渲染的是用户的私人笔记内容，模板一旦能外联就能把它传出去。所有外链（`<script src>`、`@import`、外链图片、绝对路径）都会被 `plugin:check` 拒绝。

### 校验与发布

`pnpm plugin:check` 与实例安装时执行**同一套规则**——不会出现「本地过了、装上被拒」。校验覆盖清单、文档节点、颜色 token、绑定、SVG 白名单、沙箱自包含性、预览图与体积限额，报错附带修复提示。

提交到官方目录：把文件夹放到 `plugins/community/<id>/`，跑 `pnpm plugin:check` 与 `pnpm plugins:build`，然后提 PR（含更新后的 `registry.json`）。收录 ≠ 官方背书：社区插件在所有实例上都默认关闭。

### 品牌卡

品牌方可以把自己的卡片放进社区包（[`plugins/community/kosx-pack`](https://github.com/realchendahuang/FlareMo/tree/main/plugins/community/kosx-pack) 是一个例子）。约定：清单里写明作者与品牌归属，保持 `defaultEnabled: false`——任何实例的用户都不会在未经管理员动手的情况下看到它。

---

## 规范与实现

- 完整规范：[`docs/plugin-platform-standard.md`](plugin-platform-standard.md)（槽位模型、信任分层、商店协议、路线图）。
- 贡献指南：[`plugins/README.md`](https://github.com/realchendahuang/FlareMo/blob/main/plugins/README.md)。
- 官方目录：[`https://flaremo.app/plugins/registry.json`](https://flaremo.app/plugins/registry.json)。
