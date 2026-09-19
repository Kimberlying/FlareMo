import * as React from "react";

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  disableTransitionOnChange?: boolean;
};

export type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const THEME_VALUES: Theme[] = ["dark", "light", "system"];

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined);

export function useTheme(): ThemeProviderState {
  const context = React.useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

function isTheme(value: string | null): value is Theme {
  if (value === null) {
    return false;
  }

  return THEME_VALUES.includes(value as Theme);
}

function getSystemTheme(): ResolvedTheme {
  if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
    return "dark";
  }

  return "light";
}

function applyFavicon(theme: ResolvedTheme) {
  const favicon = document.querySelector<HTMLLinkElement>(
    "[data-flaremo-favicon]",
  );
  const href =
    theme === "dark" ? favicon?.dataset.darkHref : favicon?.dataset.lightHref;

  if (favicon && href) {
    favicon.href = href;
  }
}

let faviconDefaultHrefs: { light: string; dark: string } | null = null;

/**
 * Points the themed favicon at the accent's recolored mark set. The default
 * accent keeps the bundled paths so a flame instance never changes bytes;
 * accent assets are pre-generated under /brand/<accent>/ at build time.
 */
export function setFaviconAccent(accent: string) {
  const favicon = document.querySelector<HTMLLinkElement>(
    "[data-flaremo-favicon]",
  );
  if (!favicon) return;

  faviconDefaultHrefs ??= {
    light: favicon.dataset.lightHref ?? "/brand/flaremo-mark-light-300.png",
    dark: favicon.dataset.darkHref ?? "/brand/flaremo-mark-dark-320.png",
  };
  const defaults = faviconDefaultHrefs;
  const dir = accent && accent !== "flame" ? `/brand/${accent}/` : "/brand/";
  favicon.dataset.lightHref = defaults.light.replace(/^\/brand\//, dir);
  favicon.dataset.darkHref = defaults.dark.replace(/^\/brand\//, dir);
  applyFavicon(
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
}

/**
 * Overrides the themed favicon with the instance's uploaded one. Both theme
 * variants point at the same asset; clearing the value (null) restores the
 * bundled paths so setFaviconAccent takes over again.
 */
export function setCustomFavicon(url: string | null) {
  const favicon = document.querySelector<HTMLLinkElement>(
    "[data-flaremo-favicon]",
  );
  if (!favicon) return;

  if (url === null) {
    favicon.dataset.lightHref =
      faviconDefaultHrefs?.light ?? "/brand/flaremo-mark-light-300.png";
    favicon.dataset.darkHref =
      faviconDefaultHrefs?.dark ?? "/brand/flaremo-mark-dark-320.png";
    applyFavicon(
      document.documentElement.classList.contains("dark") ? "dark" : "light",
    );
    return;
  }
  favicon.dataset.lightHref = url;
  favicon.dataset.darkHref = url;
  favicon.href = url;
}

// Keep the browser chrome (Android address bar, iOS status bar) on the same
// background the app actually renders, in both themes.
const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: "#0d0c0b",
  light: "#faf9f7",
};

function applyThemeColor(theme: ResolvedTheme) {
  const meta = document.querySelector<HTMLMetaElement>(
    "[data-flaremo-theme-color]",
  );

  if (meta) {
    meta.content = THEME_COLORS[theme];
  }
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}",
    ),
  );
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove();
      });
    });
  };
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const editableParent = target.closest(
    "input, textarea, select, [contenteditable='true']",
  );
  if (editableParent) {
    return true;
  }

  return false;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey);
    if (isTheme(storedTheme)) {
      return storedTheme;
    }

    return defaultTheme;
  });

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme);
      setThemeState(nextTheme);
    },
    [storageKey],
  );

  const applyTheme = React.useCallback(
    (nextTheme: Theme) => {
      const root = document.documentElement;
      const resolvedTheme =
        nextTheme === "system" ? getSystemTheme() : nextTheme;
      const restoreTransitions = disableTransitionOnChange
        ? disableTransitionsTemporarily()
        : null;

      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);
      applyFavicon(resolvedTheme);
      applyThemeColor(resolvedTheme);

      if (restoreTransitions) {
        restoreTransitions();
      }
    },
    [disableTransitionOnChange],
  );

  React.useEffect(() => {
    applyTheme(theme);

    if (theme !== "system") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY);
    const handleChange = () => {
      applyTheme("system");
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [theme, applyTheme]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key.toLowerCase() !== "d") {
        return;
      }

      setThemeState((currentTheme) => {
        const nextTheme =
          currentTheme === "dark"
            ? "light"
            : currentTheme === "light"
              ? "dark"
              : getSystemTheme() === "dark"
                ? "light"
                : "dark";

        localStorage.setItem(storageKey, nextTheme);
        return nextTheme;
      });
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [storageKey]);

  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) {
        return;
      }

      if (event.key !== storageKey) {
        return;
      }

      if (isTheme(event.newValue)) {
        setThemeState(event.newValue);
        return;
      }

      setThemeState(defaultTheme);
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [defaultTheme, storageKey]);

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme],
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
