import type { SupportedLocale } from "@/lib/seo";

/**
 * Share-card gallery copy. The five preview images live in
 * apps/site/public/showcase/ and are rendered as a browsing strip; the
 * heading explains the plugin model in one breath so the section doubles as
 * the landing page for the plugin system.
 */

export type CardGalleryContent = {
  badge: string;
  heading: string;
  subtitle: string;
  cards: Array<{ name: string; caption: string }>;
  cta: string;
  ctaHref: string;
};

const CONTENT: Record<SupportedLocale, CardGalleryContent> = {
  en: {
    badge: "Plugins",
    heading: "Cards are plugins. Make them yours.",
    subtitle:
      "Five cards built in, open to anyone: install packs from the directory, upload your own, choose and order what your instance offers. Document cards are pure JSON layouts; sandbox cards run your own HTML/CSS/JS — both without network access.",
    cards: [
      { name: "Plain", caption: "The note, quiet on paper." },
      { name: "Daily", caption: "The date as the hero." },
      { name: "Ticket", caption: "A keepsake with a barcode strip." },
      { name: "Postcard", caption: "A watercolor horizon, drawn in SVG." },
      { name: "Postmark", caption: "A sandbox card that draws with canvas." },
    ],
    cta: "Read the plugin guide",
    ctaHref: "/docs/plugins",
  },
  zh: {
    badge: "插件",
    heading: "卡片即插件，随你塑造。",
    subtitle:
      "内置五张卡片，向所有人开放：从目录安装、上传自己的包、挑选与排序实例展示的卡片。document 卡是纯 JSON 排版文档；sandbox 卡运行你自己的 HTML/CSS/JS——两者都没有网络访问。",
    cards: [
      { name: "素白", caption: "安静的一张纸。" },
      { name: "日签", caption: "让日期当主角。" },
      { name: "票根", caption: "带条码的纪念票。" },
      { name: "明信片", caption: "用 SVG 画出的水彩地平线。" },
      { name: "邮戳", caption: "用 canvas 手绘的沙箱卡。" },
    ],
    cta: "阅读插件指南",
    ctaHref: "/docs/plugins",
  },
  ja: {
    badge: "プラグイン",
    heading: "カードはプラグイン。自分好みに。",
    subtitle:
      "5 枚のカードを標準搭載。ディレクトリからインストール、自作パッケージのアップロード、表示するカードの選択と並べ替えができます。document カードは純粋な JSON レイアウト、sandbox カードは自作の HTML/CSS/JS を実行——どちらもネットワークには接続しません。",
    cards: [
      { name: "素白", caption: "紙の上に静かに置く。" },
      { name: "日签", caption: "日付を主役に。" },
      { name: "票根", caption: "バーコード付きの記念チケット。" },
      { name: "ポストカード", caption: "SVG で描く水彩の地平線。" },
      { name: "消印", caption: "canvas で描くサンドボックスカード。" },
    ],
    cta: "プラグインガイドを読む",
    ctaHref: "/docs/plugins",
  },
  ko: {
    badge: "플러그인",
    heading: "카드도 플러그인. 원하는 대로.",
    subtitle:
      "기본 카드 5장을 제공합니다. 디렉터리에서 설치하고, 직접 만든 패키지를 업로드하고, 인스턴스가 보여줄 카드를 고르고 정렬하세요. document 카드는 순수 JSON 레이아웃, sandbox 카드는 직접 작성한 HTML/CSS/JS를 실행하며 둘 다 네트워크에 접근하지 않습니다.",
    cards: [
      { name: "소백", caption: "종이 위에 조용히 놓인 메모." },
      { name: "데일리", caption: "날짜가 주인공." },
      { name: "티켓", caption: "바코드가 있는 기념 티켓." },
      { name: "엽서", caption: "SVG로 그린 수채화 지평선." },
      { name: "소인", caption: "canvas로 그리는 샌드박스 카드." },
    ],
    cta: "플러그인 가이드 읽기",
    ctaHref: "/docs/plugins",
  },
  ru: {
    badge: "Плагины",
    heading: "Карточки — это плагины. Сделайте их своими.",
    subtitle:
      "Пять карточек уже в комплекте. Устанавливайте пакеты из каталога, загружайте свои, выбирайте и упорядочивайте то, что видит ваш инстанс. document-карточки — чистый JSON-макет; sandbox-карточки выполняют ваш HTML/CSS/JS — и у тех, и у других нет доступа к сети.",
    cards: [
      { name: "Простая", caption: "Заметка тихо на бумаге." },
      { name: "Дневная", caption: "Дата как главный герой." },
      { name: "Билет", caption: "Сувенирный билет со штрихкодом." },
      { name: "Открытка", caption: "Акварельный горизонт в SVG." },
      { name: "Штемпель", caption: "Sandbox-карточка, нарисованная canvas." },
    ],
    cta: "Читать руководство по плагинам",
    ctaHref: "/docs/plugins",
  },
  fr: {
    badge: "Extensions",
    heading: "Les cartes sont des extensions. À vous de jouer.",
    subtitle:
      "Cinq cartes fournies. Installez des paquets depuis le répertoire, importez les vôtres, choisissez et ordonnez ce que votre instance propose. Les cartes document sont de pures mises en page JSON ; les cartes sandbox exécutent votre HTML/CSS/JS — sans accès réseau, ni pour les unes ni pour les autres.",
    cards: [
      { name: "Blanc", caption: "La note, tranquille sur le papier." },
      { name: "Citation du jour", caption: "La date en vedette." },
      { name: "Ticket", caption: "Un souvenir avec bande de codes-barres." },
      {
        name: "Carte postale",
        caption: "Un horizon aquarelle, dessiné en SVG.",
      },
      { name: "Cachet", caption: "Une carte sandbox dessinée au canvas." },
    ],
    cta: "Lire le guide des extensions",
    ctaHref: "/docs/plugins",
  },
  es: {
    badge: "Complementos",
    heading: "Las tarjetas son complementos. Hazlas tuyas.",
    subtitle:
      "Cinco tarjetas incluidas. Instala paquetes del directorio, sube los tuyos, elige y ordena lo que ofrece tu instancia. Las tarjetas document son maquetación JSON pura; las sandbox ejecutan tu propio HTML/CSS/JS, y ninguna de las dos accede a la red.",
    cards: [
      { name: "Sencilla", caption: "La nota, tranquila sobre el papel." },
      { name: "Diaria", caption: "La fecha como protagonista." },
      { name: "Billete", caption: "Un recuerdo con tira de código de barras." },
      { name: "Postal", caption: "Un horizonte en acuarela, dibujado en SVG." },
      {
        name: "Matasellos",
        caption: "Una tarjeta sandbox dibujada con canvas.",
      },
    ],
    cta: "Leer la guía de complementos",
    ctaHref: "/docs/plugins",
  },
  ar: {
    badge: "الإضافات",
    heading: "البطاقات إضافات. اجعلها على ذوقك.",
    subtitle:
      "خمس بطاقات مدمجة. ثبّت حزمًا من الدليل، وارفع حزمك الخاصة، واختر ورتّب ما تعرضه نسختك. بطاقات document هي تخطيط JSON صافٍ؛ وبطاقات sandbox تشغّل HTML/CSS/JS الخاصة بك — ولا يصل أيٌّ منهما إلى الشبكة.",
    cards: [
      { name: "أبيض", caption: "المذكرة بهدوء على الورق." },
      { name: "يومية", caption: "التاريخ هو البطل." },
      { name: "تذكرة", caption: "تذكرة تذكارية بشريط باركود." },
      { name: "بطاقة بريدية", caption: "أفق بالألوان المائية مرسوم بـ SVG." },
      { name: "ختم بريدي", caption: "بطاقة sandbox مرسومة بـ canvas." },
    ],
    cta: "اقرأ دليل الإضافات",
    ctaHref: "/docs/plugins",
  },
};

export const CARD_IMAGES = [
  "/showcase/card-plain.png",
  "/showcase/card-daily.png",
  "/showcase/card-ticket.png",
  "/showcase/card-postcard.png",
  "/showcase/card-stamp.png",
] as const;

export function getCardGalleryContent(
  locale: SupportedLocale,
): CardGalleryContent {
  return CONTENT[locale] ?? CONTENT.en;
}
