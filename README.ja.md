# FlareMo 🔥

<p align="center">
  <b>サーバー不要 · 運用コストゼロ · 24時間グローバル常時稼働 · データの完全な自己所有</b><br>
  個人では静かで集中できる思考記録スペース＆第2の脳として、チームではきめ細やかな権限を持つ共有ナレッジベースとして。
</p>

<p align="center">
  <a href="./README.md">English</a> •
  <a href="./README.zh-CN.md">简体中文</a> •
  <a href="./README.ja.md"><b>日本語</b></a> •
  <a href="./README.fr.md">Français</a> •
  <a href="./README.es.md">Español</a> •
  <a href="./README.ko.md">한국어</a> •
  <a href="./README.ru.md">Русский</a> •
  <a href="./README.ar.md">العربية</a>
</p>

<p align="center">
  <a href="https://github.com/realchendahuang/FlareMo/stargazers"><img src="https://img.shields.io/github/stars/realchendahuang/FlareMo?style=flat&color=F38020" alt="GitHub stars"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/realchendahuang/FlareMo?style=flat&color=2563EB" alt="License"></a>
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/Runtime-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Workers"></a>
  <a href="https://github.com/usememos/memos"><img src="https://img.shields.io/badge/Ecosystem-Memos%20Compatible-0284C7" alt="Memos Compatible"></a>
  <a href="https://www.better-auth.com/"><img src="https://img.shields.io/badge/Auth-Better%20Auth-10B981" alt="Better Auth"></a>
  <a href="https://flaremo.app"><img src="https://img.shields.io/badge/ウェブサイト-flaremo.app-EA580C" alt="Website"></a>
</p>

<div align="center">

| ☀️ デスクトップ · ライト | 🌙 デスクトップ · ダーク | 📱 モバイル · レスポンシブ |
| :---: | :---: | :---: |
| <img src="./docs/assets/flaremo-desktop-light.png" width="360" alt="FlareMo デスクトップ ライト画面" /> | <img src="./docs/assets/flaremo-desktop-dark.png" width="360" alt="FlareMo デスクトップ ダーク画面" /> | <img src="./docs/assets/flaremo-mobile.png" width="168" alt="FlareMo モバイル画面" /> |

<sub>実際の稼働画面：ライト・ダークテーマのシームレスな切り替えと、フル機能のモバイルレスポンシブ表示に対応。表示されている機能はすべてバックエンド実装済みです。</sub>

</div>

---

## 💡 FlareMoを選ぶ理由

FlomoやMemosなどのツールは、摩擦のないメモ作成とタイムライン表示がもたらす価値を証明しました。しかし、従来のノートシステムをセルフホストするには、月額料金のかかるVPSを契約し、DockerやPostgreSQLを構成し、定期的なバックアップスクリプトを保守し、ハードウェア故障のリスクに怯える必要がありました。

FlareMoは別の答えを提示します：**無料のCloudflareアカウント1つだけで、サーバー代ゼロ、DB保守ゼロ、バックアップ設定不要で、24時間常時利用でき、データをマルチリージョンで保護しながら、世界中から低遅延でアクセス可能なナレッジベースを持てるか？**

答えは「Yes」です。

- **真のサーバーレス**：コードとフロントエンドはCloudflare Workersの世界300以上のエッジノードで稼働し、ミリ秒単位で応答。
- **エンタープライズ級の耐久性**：メモとメタデータはCloudflare D1に保存され、メディア添付ファイルはマルチリージョン冗長化されたCloudflare R2に保管。
- **AIネイティブ設計**：標準MCP（Model Context Protocol）と「Agent Memory」長期記憶ハブを内蔵し、ClaudeやCursor、CodexなどのAIが第2の脳として機能。
- **個人の静けさとチームの協調**：個人使用時は安全なプライベート空間、チームモードを有効化すればロール管理と3段階の公開範囲を備えたコラボレーションスペースに早変わり。
- **シンプル、でも削らない**: 界面は静かに保ち、操作はすべて存在する理由がある。装飾も欠落もない。

---

## ✨ 主な機能

### 1. 瞬時のメモ作成とインスピレーションの振り返り
- **開いてすぐ書ける**：カード型ストリームタイムライン、マルチタグ分類、Markdown/GFMレンダリング、画像・音声プレビュー。
- **高速全文検索**：SQLite FTS5による高速検索（`has:attachment`、`is:pinned`、`before:YYYY-MM-DD`、`after:YYYY-MM-DD`、`in:timeline|archive|trash` などのフィルタ対応）。
- **ベクトルセマンティック検索**：Workers AI埋め込みとVectorizeインデックスを統合した「探す」機能。権限を再検証し、未設定時はFTS5へ自動フォールバック。
- **振り返り機能**：**デイリーレビュー**（過去の今日の記録）、**ランダムウォーク**（タグやリンクグラフの探索＋要約カード）、詳細ページでの関連メモ推薦。
- **履歴管理**：変更差分の確認とワンクリックでの過去リビジョン復元。

### 2. AI長期記憶とMCPネイティブ連携
- **Agent Memory**：`/memory/mcp` エンドポイント経由で、AIエージェントがセッションを跨いだ長期記憶（好み、決定事項、制約、教訓）を直接読み書き可能。
- **人間中心の監査**：`/memory` 画面でAIが蓄積した記憶を確認・確定・ロック・修正でき、知識の正確性を担保。
- **標準MCP**：Streamable HTTP MCPエンドポイント（`/mcp`）により、メモの検索や追加をプログラミング可能。

### 3. プロジェクトとタスク
- **プロジェクトで作業をまとめる**：関連するメモとTODOをプロジェクトに整理。ステータス列をドラッグで移動できるカンバン、優先度、手動並べ替え、締め切り日に対応。
- **個人専用・取り消せる削除**：タスクはオーナー個人のリソース。削除はゴミ箱経由で、復元も期間経過後の自動消去も可能です。

### 4. カレンダー
- **タスクが予定の一次情報源**：`/calendar` の月間ビューでは、過去のマスにその日の記録、未来のマスに締め切りのあるタスクが並びます。ドラッグで予定変更、日付付きタスクのクイック追加、agenda リストに対応。
- **期限超過リマインダー**：期限を過ぎたタスクはアプリ内通知で知らせ、ブラウザの Web Push も任意で有効化できます。

### 5. チームコラボレーションと3段階のアクセス制御
- **ロール管理**：`owner`、`admin`、`member` の3つのロール。管理者がワンタイムアクティベーションリンクを発行し、メンバー自身がパスワードを設定。
- **3段階の公開範囲**：
  - 🔒 **プライベート**：作成者本人のみ閲覧可能。
  - 👥 **チーム**：チームのアクティブメンバーのみ閲覧可能。
  - 🌐 **公開**：期限付きURLによる安全な匿名閲覧。
- **安全な脱退処理**：メンバー削除時、プライベートデータのみを確実に物理削除し、チームや公開メモは保持。
- **リーダーシート**: 期限付きの閲覧専用席を発行できます（ゲスト読者、講座受講者、クライアント納品など）。有効期限が切れると自動的に失効します（認証解決時にフェイルクローズ、cron 不要）。メンバー画面から管理するか、個人アクセストークンで冪等エンドポイント `PUT /api/app/admin/team/reader` を呼び出してメールアドレスから開通できます（`docs/team-mode.md` 参照）。

### 6. オフラインファースト＆PWA体験
- **インストール可能なPWA**：デスクトップやスマートフォンのホーム画面に追加し、ネイティブアプリ同様の操作感。
- **信頼性の高いオフライン同期**：ネットワーク切断時も下書きを即座にローカル保存。再接続時に未同期キューを自動順次送信。
- **リアルタイム音声メモ**：`/capture` ページからマイクによるリアルタイムストリーミング音声文字起こし（ASR）に対応。

### 7. 堅牢なBetter Auth認証
- **Better Auth採用**：ブラウザは安全な `HttpOnly` / `SameSite=Lax` クッキーセッション、スクリプトやMCPクライアントには失効可能な Personal Access Token (`memos_pat_`) を使用。
- **厳格なOrigin保護**：状態変更リクエスト（POST/PATCH/DELETE）に対するOrigin検証を徹底。Cloudflare Accessを任意の外層防御として併用可能。

### 8. Memos互換とスムーズな移行
- **Memos API互換**：`/api/v1/*` コアエンドポイントとOpenAPI仕様をサポート。
- **既存クライアント対応**：Moe Memosなどのサードパーティ製アプリから直接接続可能。
- **双方向インポート・エクスポート**：Memos / flomo形式のデータパッケージを一発でインポート（重複解決設定付き）および完全エクスポート。

---

### 9. プラグインシステム：カードはプラグイン
- **標準カード 5 種**：素白、日签、票根、ポストカード、そして canvas で描く消印デモ。
- **ストアと管理**：設定画面からディレクトリを閲覧、ワンクリック導入（SHA-256 検証）、有効化・無効化、並べ替え、デフォルト指定、非表示。公式ディレクトリは [flaremo.app/plugins](https://flaremo.app/plugins/registry.json)。
- **自作パッケージの導入**：管理者はローカルパッケージをインストール可能。そのインスタンスだけに存在し、外部へ送信されません。
- **制作ツール**：`pnpm plugin:new` で雛形生成、`pnpm plugin:check` は**インストール時と同一のルール**で検証、`pnpm plugins:build` でパッケージ化。document カードは純粋な JSON レイアウト、sandbox カードは自作の HTML/CSS/JS。詳しくは [プラグインガイド](./docs/plugins.md)。
- **デフォルトで安全**：カードは不透明オリジンのサンドボックスで動作し、**ネットワークアクセスは一切ありません**。コミュニティ／ブランドパックは管理者が有効化するまでオフです。

## 📊 無料枠でどこまで使えるか？

| リソース | 無料利用枠 | 想定容量 | 実際の使用期間目安 |
| :--- | :--- | :--- | :--- |
| **Cloudflare D1** | **5 GB データベース** | 約 **250万件** のテキストメモ | 毎日100件記録しても **68年間** 利用可能 |
| **Cloudflare R2** | **10 GB オブジェクトストレージ** | 約 **5,000〜10,000枚** の画像 / **80時間** の音声 | **下り転送無料（$0 Egress）** で安心 |
| **Cloudflare Workers** | 充実した無料リクエスト枠 | 世界300以上のエッジノード | コールドスタートなし、超低遅延で即時応答 |

---

## 🥊 比較：Cloudflareネイティブ vs 自宅NAS vs 従来型VPS

| 項目 | Cloudflareネイティブ (FlareMo) | 自宅NAS / ミニPC | 従来型VPS |
| :--- | :--- | :--- | :--- |
| **データの安全性** | **エンタープライズ級マルチリージョン永続化** | ドライブ故障・停電・水害で全データ消失のリスク | 手動設定のバックアップやスナップショット依存 |
| **日常の保守** | **完全不要**：OS更新なし、Docker管理なし | 定期的なOSアップデート、SMART監視が必要 | カーネル更新、セキュリティパッチ、監視設定が必要 |
| **アクセス速度** | **グローバルエッジCDN** で世界中から高速アクセス | 自宅の上り回線帯域に依存、トンネル設定が必要 | 単一データセンターに依存し、海外からの遅延大 |
| **SSLとドメイン** | **自動HTTPS＆カスタムドメイン設定**、自動更新 | ドメイン証明書の定期取得やDDNS設定が必要 | Webサーバー（Nginx等）設定とLet's Encrypt保守 |
| **費用コスト** | **完全無料（0円）** | 高額な初期ハードウェア代＋日々の電気代 | 毎月・毎年のサーバー利用料が継続発生 |

---

## 🚀 5分でできるクイックデプロイ

### 方法1：AIエージェントによる自動デプロイ（推奨）

Claude Code、Cursor Agent、Codex等のコマンド実行可能なエージェントに [docs/agent-deploy.md](./docs/agent-deploy.md) を渡してください：
> 「docs/agent-deploy.md に従って、FlareMo を私の Cloudflare アカウントにデプロイしてください。」

---

### 方法2：CLIによる手動デプロイ（3ステップ）

#### 1. リソース作成
```bash
pnpm exec wrangler whoami
pnpm exec wrangler d1 create flaremo
pnpm exec wrangler r2 bucket create flaremo-attachments
```

#### 2. 設定とシークレットの登録
```bash
cp wrangler.jsonc.example wrangler.jsonc
# wrangler.jsonc に database_id と FLAREMO_PUBLIC_URL を記入
pnpm exec wrangler secret put BETTER_AUTH_SECRET --config ./wrangler.jsonc
pnpm exec wrangler secret put FLAREMO_BOOTSTRAP_SECRET --config ./wrangler.jsonc
```

#### 3. デプロイの実行
```bash
pnpm deploy:dry-run
pnpm deploy
```
（フルの `pnpm verify` ゲートは、メンテナーが明示的に要求した場合のみ実行します。）
デプロイ完了後、ブラウザで `/setup` にアクセスし、`FLAREMO_BOOTSTRAP_SECRET` を入力して管理者アカウントを初期化します。

---

## 📄 ライセンス

本プロジェクトは [GNU AGPL-3.0](./LICENSE) ライセンスで公開されています。
Copyright (c) 2026 realchendahuang.
