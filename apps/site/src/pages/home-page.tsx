import { useLocation } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Database,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  Radio,
  ServerOff,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  WifiOff,
  Zap,
} from "lucide-react";
import { CardGallerySection } from "@/components/card-gallery-section";
import { InteractiveShowcase } from "@/components/interactive-showcase";
import {
  AnimatedNumber,
  PopIn,
  Reveal,
  RevealGroup,
  RevealItem,
} from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { getHomeContent } from "@/content/copy";
import {
  getLocaleFromPath,
  getLocalizedPath,
  type SupportedLocale,
} from "@/lib/seo";

const FEATURE_ICONS = [ShieldCheck, Database, WifiOff, Bot, Users, Layers];

const STAT_TITLES: Record<
  SupportedLocale,
  { servers: string; ownership: string }
> = {
  en: { servers: "0 Servers", ownership: "100% Yours" },
  zh: { servers: "0 台服务器", ownership: "100% 自主" },
  ja: { servers: "0台のサーバー", ownership: "100% 自主管理" },
  fr: { servers: "0 serveur", ownership: "100 % à vous" },
  es: { servers: "0 servidores", ownership: "100% tuyo" },
  ko: { servers: "0대 서버", ownership: "100% 완전 소유" },
  ru: { servers: "0 серверов", ownership: "100% ваше" },
  ar: { servers: "0 خوادم", ownership: "100% ملكك" },
};

const COMP_HEADERS: Record<SupportedLocale, { nas: string; vps: string }> = {
  en: { nas: "Home NAS / Homelab", vps: "Traditional VPS Cloud" },
  zh: { nas: "家用 NAS / 软路由", vps: "传统 VPS 云主机" },
  ja: { nas: "自宅 NAS / ルーター", vps: "従来の VPS" },
  fr: { nas: "NAS domestique", vps: "VPS traditionnel" },
  es: { nas: "NAS doméstico", vps: "VPS tradicional" },
  ko: { nas: "홈 NAS", vps: "기존 VPS" },
  ru: { nas: "Домашний NAS", vps: "Обычный VPS" },
  ar: { nas: "وحدة NAS منزلية", vps: "خوادم VPS التقليدية" },
};

const COMP_DIMENSIONS: Record<SupportedLocale, string> = {
  en: "Dimension",
  zh: "对比维度",
  ja: "比較項目",
  fr: "Dimension",
  es: "Dimensión",
  ko: "비교 기준",
  ru: "Критерий",
  ar: "معيار المقارنة",
};

export function HomePage() {
  const { pathname } = useLocation();
  const locale = getLocaleFromPath(pathname);
  const home = getHomeContent(locale);

  return (
    <main className="space-y-24 sm:space-y-32 pb-24 overflow-x-hidden">
      <Hero home={home} locale={locale} />
      <InteractiveShowcase locale={locale} />
      <BentoFeatures
        badge={home.featuresBadge}
        heading={home.featuresHeading}
        icons={FEATURE_ICONS}
        items={home.features}
        subtitle={home.featuresSubtitle}
      />
      <ComparisonSection
        heading={home.comparisonHeading}
        locale={locale}
        rows={home.comparisonRows}
        subtitle={home.comparisonSubtitle}
      />
      <EcosystemSection locale={locale} />
      <CardGallerySection locale={locale} />
      <FaqSection
        badge={home.faqBadge}
        heading={home.faqHeading}
        items={home.faqItems}
      />
      <CtaSection
        badge={home.ctaBadge}
        buttonText={home.ctaButton}
        heading={home.ctaHeading}
        locale={locale}
        secondaryCta={home.secondaryCta}
        subtitle={home.ctaSubtitle}
      />
    </main>
  );
}

/* ============================================================
   1. Hero 区块
   ============================================================ */

function Hero({
  locale,
  home,
}: {
  locale: SupportedLocale;
  home: ReturnType<typeof getHomeContent>;
}) {
  const titles = STAT_TITLES[locale] || STAT_TITLES.en;

  return (
    <section className="relative pt-12 md:pt-20">
      <div className="container-x space-y-12">
        {/* 限宽交给各子元素（副标题自带 mx-auto max-w-2xl）；外层不能限宽——
            EN/ZH 标题锁行 nowrap 后行宽会超过 3xl，行盒溢出会导致 text-center 失效 */}
        <div className="space-y-6 text-center">
          {/* Eyebrow Pill */}
          <PopIn className="inline-flex">
            <div className="inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/10 px-3.5 py-1 text-xs font-semibold text-signal-ink shadow-2xs backdrop-blur-md">
              <span>{home.heroEyebrow}</span>
            </div>
          </PopIn>

          {/* Headline */}
          <Reveal delay={0.08}>
            <h1 className="text-[clamp(1.75rem,5.2vw,4.25rem)] font-extrabold tracking-tight text-ink leading-[1.14]">
              {/* nowrap 仅对允许整行展示的语言生效（CJK/拉丁）；阿语等长词换行语言不锁行 */}
              <span
                className={`block${locale === "en" || locale === "zh" ? " sm:whitespace-nowrap" : ""}`}
              >
                {home.heroTitleLine1}
              </span>
              <span
                className={`mt-1.5 block sm:mt-2.5 text-brand-gradient${locale === "en" || locale === "zh" ? " sm:whitespace-nowrap" : ""}`}
              >
                {home.heroTitleLine2}
              </span>
            </h1>
          </Reveal>

          {/* Subtitle */}
          <Reveal delay={0.16}>
            <p className="mx-auto max-w-2xl text-pretty text-base text-mist sm:text-lg leading-relaxed">
              {home.heroSubtitle}
            </p>
          </Reveal>

          {/* Actions */}
          <Reveal delay={0.24}>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                render={<a href={getLocalizedPath("/docs/deploy", locale)} />}
                size="lg"
                variant="flame"
                className="shadow-pop"
              >
                <span>{home.primaryCta}</span>
                <ArrowRight className="size-4 rtl:-rotate-180" />
              </Button>

              <Button
                render={
                  <a
                    href="https://github.com/realchendahuang/FlareMo"
                    rel="noopener noreferrer"
                    target="_blank"
                  />
                }
                size="lg"
                variant="secondary"
              >
                <span>{home.secondaryCta}</span>
                <ExternalLink className="size-3.5 text-mist" />
              </Button>
            </div>
          </Reveal>
        </div>

        {/* 4 栏核心指标看板 */}
        <RevealGroup
          stagger={0.08}
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          <RevealItem>
            <SpotlightCard className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <div className="icon-dock flex size-9 items-center justify-center text-signal">
                  <Database className="size-4" />
                </div>
                <Badge variant="flame">D1 Storage</Badge>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold tracking-tight tabular-nums text-ink">
                  <AnimatedNumber value={5} suffix=" GB" locale={locale} />
                </div>
                <div className="mt-1 text-xs text-mist">{home.statMemos}</div>
              </div>
            </SpotlightCard>
          </RevealItem>

          <RevealItem>
            <SpotlightCard className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <div className="icon-dock flex size-9 items-center justify-center text-signal">
                  <ImageIcon className="size-4" />
                </div>
                <Badge variant="flame">R2 Free Egress</Badge>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold tracking-tight tabular-nums text-ink">
                  <AnimatedNumber value={10} suffix=" GB" locale={locale} />
                </div>
                <div className="mt-1 text-xs text-mist">{home.statPhotos}</div>
              </div>
            </SpotlightCard>
          </RevealItem>

          <RevealItem>
            <SpotlightCard className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <div className="icon-dock flex size-9 items-center justify-center text-signal">
                  <ServerOff className="size-4" />
                </div>
                <Badge variant="secondary">Zero Ops</Badge>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold tracking-tight tabular-nums text-ink">
                  {titles.servers}
                </div>
                <div className="mt-1 text-xs text-mist">{home.statServers}</div>
              </div>
            </SpotlightCard>
          </RevealItem>

          <RevealItem>
            <SpotlightCard className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <div className="icon-dock flex size-9 items-center justify-center text-signal">
                  <ShieldCheck className="size-4" />
                </div>
                <Badge variant="success">Your Data</Badge>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold tracking-tight tabular-nums text-ink">
                  {titles.ownership}
                </div>
                <div className="mt-1 text-xs text-mist">{home.statUptime}</div>
              </div>
            </SpotlightCard>
          </RevealItem>
        </RevealGroup>
      </div>
    </section>
  );
}

/* ============================================================
   2. Bento 核心特性网格
   ============================================================ */

function BentoFeatures({
  badge,
  heading,
  subtitle,
  items,
  icons,
}: {
  badge: string;
  heading: string;
  subtitle: string;
  items: Array<{ title: string; description: string }>;
  icons: typeof FEATURE_ICONS;
}) {
  return (
    <section id="features" className="container-x space-y-10 scroll-mt-20">
      <div className="max-w-2xl space-y-2">
        <Badge variant="flame">{badge}</Badge>
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
          {heading}
        </h2>
        <p className="text-sm text-mist">{subtitle}</p>
      </div>

      <RevealGroup
        stagger={0.06}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {items.map((item, idx) => {
          const Icon = icons[idx] ?? Bot;
          return (
            <RevealItem key={item.title}>
              <div className="panel-card p-6 flex flex-col justify-between h-full group">
                <div>
                  <div className="mb-4 flex size-11 items-center justify-center icon-dock text-signal transition-transform duration-300 group-hover:scale-105">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="text-base font-bold tracking-tight text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-mist">
                    {item.description}
                  </p>
                </div>
              </div>
            </RevealItem>
          );
        })}
      </RevealGroup>
    </section>
  );
}

/* ============================================================
   4. 三方对比矩阵
   ============================================================ */

function ComparisonSection({
  heading,
  subtitle,
  rows,
  locale,
}: {
  heading: string;
  subtitle: string;
  rows: Array<{ label: string; cloudflare: string; nas: string; vps: string }>;
  locale: SupportedLocale;
}) {
  const headers = COMP_HEADERS[locale] || COMP_HEADERS.en;

  return (
    <section id="comparison" className="container-x space-y-8 scroll-mt-20">
      <div className="max-w-2xl space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
          {heading}
        </h2>
        <p className="text-sm text-mist">{subtitle}</p>
      </div>

      <div className="panel-card overflow-hidden border border-line/60 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/60 bg-soft-surface/80 text-left text-xs uppercase tracking-wider text-mist">
                <th className="px-5 py-4 font-semibold">
                  {COMP_DIMENSIONS[locale] || COMP_DIMENSIONS.en}
                </th>
                <th className="bg-signal/10 px-5 py-4 font-bold text-signal-ink">
                  Cloudflare (FlareMo)
                </th>
                <th className="px-5 py-4 font-semibold">{headers.nas}</th>
                <th className="px-5 py-4 font-semibold">{headers.vps}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((row) => (
                <tr
                  className="transition-colors hover:bg-wash/50"
                  key={row.label}
                >
                  <th className="px-5 py-4 text-left align-top font-semibold text-ink whitespace-nowrap">
                    {row.label}
                  </th>
                  <td className="bg-signal/5 px-5 py-4 align-top font-semibold text-ink">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-signal/20 text-signal-ink">
                        <Check className="size-2.5" />
                      </span>
                      <span>{row.cloudflare}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top text-mist">{row.nas}</td>
                  <td className="px-5 py-4 align-top text-mist">{row.vps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   5. 多端生态与无缝兼容展示
   ============================================================ */

const ECOSYSTEM_CONTENT: Record<
  SupportedLocale,
  {
    badge: string;
    heading: string;
    subtitle: string;
    clients: Array<{
      title: string;
      tag: string;
      desc: string;
    }>;
  }
> = {
  zh: {
    badge: "连接你已有的工具",
    heading: "全面的 Memos 生态无缝兼容",
    subtitle:
      "完整兼容 Memos /api/v1 协议与可撤销个人访问令牌（PAT），你的现有工具链立即可用。",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS & Android",
        desc: "最受欢迎的开源移动双端，支持直接以 FlareMo 地址与 PAT 凭据连接。",
      },
      {
        title: "Telegram Bot",
        tag: "即时捕捉",
        desc: "随手向专属 Bot 发送文字、图片与语音，几秒内完成碎片灵感入库。",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "连接 Claude Desktop、Cursor 与 Codex，将记录库作为 AI 长期记忆体。",
      },
      {
        title: "Raycast / Alfred",
        tag: "桌面心流",
        desc: "全局快捷键一秒唤起输入框，不打断手头心流快速记下闪念。",
      },
    ],
  },
  en: {
    badge: "Bring Your Own Tools",
    heading: "Full Memos Ecosystem Compatibility",
    subtitle:
      "Drop-in compatibility with Memos /api/v1 endpoints and Personal Access Tokens (PAT). Keep your favorite daily tools.",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS & Android",
        desc: "The most popular open-source mobile client for iOS and Android with direct PAT connection.",
      },
      {
        title: "Telegram Bot",
        tag: "Instant Capture",
        desc: "Send notes, voice memos, and photos directly to your personal bot in seconds.",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "Connect Claude Desktop, Cursor, and Codex as your AI long-term external brain.",
      },
      {
        title: "Raycast / Alfred",
        tag: "Desktop Workflow",
        desc: "Trigger global quick-capture shortcuts on desktop without breaking your creative flow.",
      },
    ],
  },
  ja: {
    badge: "既存ツールをそのまま",
    heading: "Memos エコシステムとの完全互換",
    subtitle:
      "Memos /api/v1 エンドポイントと PAT トークンを標準サポート。使い慣れたツールをそのまま活用できます。",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS & Android",
        desc: "iOS/Android 対応の人気オープンソースモバイルクライアント。PAT で直接連携。",
      },
      {
        title: "Telegram Bot",
        tag: "即時キャプチャ",
        desc: "専用 Bot にテキストや写真、音声メモを送信して数秒でインプット完了。",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "Claude Desktop や Cursor、Codex と連携し、ノートを AI の長期記憶として活用。",
      },
      {
        title: "Raycast / Alfred",
        tag: "デスクトップ",
        desc: "ショートカットで瞬時にメモウィンドウを起動し、思考の流れを中断せず記録。",
      },
    ],
  },
  fr: {
    badge: "Vos outils restent",
    heading: "Compatibilité totale avec l'écosystème Memos",
    subtitle:
      "Compatibilité directe avec l'API Memos /api/v1 et les jetons PAT. Conservez vos outils préférés.",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS & Android",
        desc: "Client mobile open-source populaire pour iOS et Android avec synchronisation directe.",
      },
      {
        title: "Telegram Bot",
        tag: "Capture instantanée",
        desc: "Envoyez des notes, des messages vocaux et des photos directement à votre bot en quelques secondes.",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "Connectez Claude Desktop, Cursor et Codex comme mémoire externe à long terme pour l'IA.",
      },
      {
        title: "Raycast / Alfred",
        tag: "Flux de bureau",
        desc: "Raccourci clavier global pour capturer des pensées sans interrompre votre concentration.",
      },
    ],
  },
  es: {
    badge: "Tus herramientas siguen",
    heading: "Compatibilidad total con el ecosistema Memos",
    subtitle:
      "Compatibilidad directa con la API /api/v1 de Memos y tokens PAT. Conserva todas tus herramientas diarias.",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS y Android",
        desc: "Cliente móvil de código abierto líder para iOS y Android con conexión directa mediante PAT.",
      },
      {
        title: "Telegram Bot",
        tag: "Captura instantánea",
        desc: "Envía notas, audios y fotos directamente a tu bot personal en cuestión de segundos.",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "Conecta Claude Desktop, Cursor y Codex como memoria externa a largo plazo para IA.",
      },
      {
        title: "Raycast / Alfred",
        tag: "Flujo de escritorio",
        desc: "Atajo de teclado global para captura rápida en escritorio sin interrumpir tu concentración.",
      },
    ],
  },
  ko: {
    badge: "기존 도구 연결",
    heading: "완벽한 Memos 생태계 호환성",
    subtitle:
      "Memos /api/v1 표준 API 및 PAT 토큰 호환. 기존에 사용하던 모든 도구를 즉시 연결할 수 있습니다.",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS & Android",
        desc: "iOS 및 Android를 지원하는 인기 오픈소스 모바일 클라이언트. PAT로 즉시 연결.",
      },
      {
        title: "Telegram Bot",
        tag: "즉각적인 기록",
        desc: "전용 봇에 텍스트, 음성, 사진을 보내 몇 초 만에 아이디어를 안전하게 저장.",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "Claude Desktop, Cursor, Codex에 연결하여 나만의 AI 장기 외장 기억 저장소로 활용.",
      },
      {
        title: "Raycast / Alfred",
        tag: "데스크톱 워크플로",
        desc: "단축키로 1초 만에 캡처 창을 호출하여 작업 흐름의 중단 없이 빠르게 메모.",
      },
    ],
  },
  ru: {
    badge: "Ваши инструменты",
    heading: "Полная совместимость с экосистемой Memos",
    subtitle:
      "Поддержка Memos /api/v1 и токенов PAT. Ваши любимые приложения и скрипты работают сразу.",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS и Android",
        desc: "Популярный мобильный клиент с открытым исходным кодом для iOS и Android.",
      },
      {
        title: "Telegram Bot",
        tag: "Быстрый сбор",
        desc: "Отправляйте заметки, голос и фото в личного бота за пару секунд.",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "Подключение Claude Desktop, Cursor и Codex в качестве внешней памяти для ИИ.",
      },
      {
        title: "Raycast / Alfred",
        tag: "Настольный поток",
        desc: "Глобальное сочетание клавиш для мгновенной фиксации идей на рабочем столе.",
      },
    ],
  },
  ar: {
    badge: "أدواتك الحالية تعمل",
    heading: "توافق كامل مع منظومة Memos",
    subtitle:
      "توافق مباشر مع واجهة Memos /api/v1 ورموز الوصول الشخصية (PAT). احتفظ بأدواتك اليومية المفضلة.",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS و Android",
        desc: "عميل الهاتف المحمول مفتوح المصدر الشهير لنظامي iOS و Android مع اتصال مباشر.",
      },
      {
        title: "Telegram Bot",
        tag: "التقاط فوري",
        desc: "أرسل الملاحظات والرسائل الصوتية والصور مباشرة إلى روبوتك الشخصي في ثوانٍ.",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "اربط Claude Desktop و Cursor كذاكرة طويلة المدى للذكاء الاصطناعي الخاص بك.",
      },
      {
        title: "Raycast / Alfred",
        tag: "سير العمل المكتبي",
        desc: "مفتاح اختصار شامل لالتقاط الأفكار على سطح المكتب دون مقاطعة تركيزك.",
      },
    ],
  },
};

const ECOSYSTEM_ICONS = [Smartphone, Radio, Sparkles, Zap];

function EcosystemSection({ locale }: { locale: SupportedLocale }) {
  const content = ECOSYSTEM_CONTENT[locale] || ECOSYSTEM_CONTENT.en;

  return (
    <section id="ecosystem" className="container-x space-y-8 scroll-mt-20">
      <div className="max-w-2xl space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
          {content.heading}
        </h2>
        <p className="text-sm text-mist">{content.subtitle}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {content.clients.map((c, idx) => {
          const Icon = ECOSYSTEM_ICONS[idx] ?? Sparkles;
          return (
            <div
              key={c.title}
              className="panel-card p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="icon-dock flex size-9 items-center justify-center text-signal">
                    <Icon className="size-4" />
                  </div>
                  <Badge variant="secondary">{c.tag}</Badge>
                </div>
                <h3 className="mt-4 text-base font-bold text-ink">{c.title}</h3>
                <p className="mt-1.5 text-xs text-mist leading-relaxed">
                  {c.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================
   6. FAQ 手风琴常见问题
   ============================================================ */

function FaqSection({
  badge,
  heading,
  items,
}: {
  badge: string;
  heading: string;
  items: Array<{ q: string; a: string }>;
}) {
  return (
    <section id="faq" className="container-x space-y-8 scroll-mt-20">
      <div className="max-w-2xl space-y-2">
        <Badge variant="secondary">{badge}</Badge>
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
          {heading}
        </h2>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <details
            className="group panel-card p-5 transition-all duration-200 open:shadow-md cursor-pointer [&_summary::-webkit-details-marker]:hidden"
            key={item.q}
          >
            <summary className="flex list-none items-center justify-between gap-3 text-base font-bold text-ink">
              <span>{item.q}</span>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-soft-surface text-mist transition-transform duration-200 group-open:rotate-180">
                <ChevronDown className="size-4" />
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-mist border-t border-line/50 pt-3">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   7. 底部高光 CTA 横幅
   ============================================================ */

function CtaSection({
  badge,
  heading,
  subtitle,
  buttonText,
  secondaryCta,
  locale,
}: {
  badge: string;
  heading: string;
  subtitle: string;
  buttonText: string;
  secondaryCta: string;
  locale: SupportedLocale;
}) {
  return (
    <section className="container-x">
      <div className="relative overflow-hidden rounded-3xl border border-signal/30 bg-surface p-8 sm:p-12 md:p-16 text-center shadow-pop-xl">
        {/* 背景径向余烬光晕 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-96 rounded-full bg-signal/20 blur-3xl"
        />

        <div className="relative z-10 mx-auto max-w-2xl space-y-5">
          <Badge variant="flame">{badge}</Badge>
          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-ink sm:text-4xl md:text-5xl">
            {heading}
          </h2>
          <p className="text-pretty text-sm sm:text-base text-mist max-w-xl mx-auto leading-relaxed">
            {subtitle}
          </p>
          <div className="pt-4 flex flex-wrap justify-center gap-3">
            <Button
              render={<a href={getLocalizedPath("/docs/deploy", locale)} />}
              size="lg"
              variant="flame"
              className="shadow-pop"
            >
              <span>{buttonText}</span>
              <ArrowRight className="size-4 rtl:-rotate-180" />
            </Button>
            <Button
              render={
                <a
                  href="https://github.com/realchendahuang/FlareMo"
                  rel="noopener noreferrer"
                  target="_blank"
                />
              }
              size="lg"
              variant="secondary"
            >
              <span>{secondaryCta}</span>
              <ExternalLink className="size-3.5 text-mist" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
