import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { TranslationKey } from "./i18n/key";
import { ar } from "./i18n/messages/ar";
import { enUS } from "./i18n/messages/en-US";
import { es } from "./i18n/messages/es";
import { fr } from "./i18n/messages/fr";
import { ja } from "./i18n/messages/ja";
import { ko } from "./i18n/messages/ko";
import { ru } from "./i18n/messages/ru";
import { zhCN } from "./i18n/messages/zh-CN";

export type { TranslationKey } from "./i18n/key";

/** Interpolation values for translated messages ({count}, {date}, …). */
export type TranslationParams = Record<string, string | number>;

/** App locales mirror the marketing site: en/zh/ja/fr/es/ko/ru/ar. */
export type Locale =
  | "zh-CN"
  | "en-US"
  | "ja"
  | "fr"
  | "es"
  | "ko"
  | "ru"
  | "ar";

const LOCALE_STORAGE_KEY = "flaremo.locale";

const messages: Record<Locale, Record<TranslationKey, string>> = {
  "zh-CN": zhCN,
  "en-US": enUS,
  ja,
  fr,
  es,
  ko,
  ru,
  ar,
};

/** Native names shown in the language switcher (never translated). */
export const LOCALE_LABELS: Record<Locale, string> = {
  "zh-CN": "简体中文",
  "en-US": "English",
  ja: "日本語",
  fr: "Français",
  es: "Español",
  ko: "한국어",
  ru: "Русский",
  ar: "العربية",
};

export const SUPPORTED_LOCALES = Object.keys(messages) as Locale[];

/** RTL only for Arabic; every other locale is LTR. */
export function isRtlLocale(locale: Locale): boolean {
  return locale === "ar";
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtlLocale(locale) ? "rtl" : "ltr";
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: TranslationKey, params?: TranslationParams) => {
      const template =
        messages[locale][key] ??
        messages["en-US"][key] ??
        // Dynamic keys built from server enums (e.g. memory.type.*) can point
        // at values added server-side after this client shipped. A readable
        // fallback keeps the page alive; a throw would crash the route.
        key.split(".").at(-1) ??
        key;
      return interpolate(template, params);
    };
    return { locale, setLocale, t };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider.");
  }
  return context;
}

/**
 * Resolves the locale the provider would pick (stored preference, else
 * navigator). Exposed for non-React callers — route loaders warm caches that
 * are keyed by locale-dependent values (e.g. the calendar's week start).
 */
export function getInitialLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (isLocale(stored)) {
    return stored;
  }
  return matchNavigatorLocale() ?? "en-US";
}

/** Best-match navigator.languages against our catalog (zh→zh-CN etc.). */
function matchNavigatorLocale(): Locale | null {
  for (const candidate of navigator.languages ?? []) {
    const base = candidate.toLowerCase().split("-")[0];
    const match = SUPPORTED_LOCALES.find(
      (locale) => locale.toLowerCase().split("-")[0] === base,
    );
    if (match) return match;
  }
  return null;
}

function isLocale(value: string | null): value is Locale {
  return (
    value === "zh-CN" ||
    value === "en-US" ||
    value === "ja" ||
    value === "fr" ||
    value === "es" ||
    value === "ko" ||
    value === "ru" ||
    value === "ar"
  );
}

function interpolate(template: string, params?: TranslationParams) {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    String(params[key] ?? match),
  );
}
