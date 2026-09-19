import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { type Theme, useTheme } from "@/components/theme-provider";
import type { TranslationKey, TranslationParams } from "@/i18n";
import { cn } from "@/lib/utils";
import { SettingsSectionGroup } from "./apple-settings-ui";

type AppearancePanelProps = {
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

export function AppearancePanel({ t }: AppearancePanelProps) {
  const { theme, setTheme } = useTheme();

  const themes: {
    id: Theme;
    label: string;
    description: string;
    icon: typeof SunIcon;
  }[] = [
    {
      id: "system",
      label: t("theme.system"),
      description: t("theme.systemDescription"),
      icon: MonitorIcon,
    },
    {
      id: "light",
      label: t("theme.light"),
      description: t("theme.lightDescription"),
      icon: SunIcon,
    },
    {
      id: "dark",
      label: t("theme.dark"),
      description: t("theme.darkDescription"),
      icon: MoonIcon,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {t("theme.title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {t("theme.description")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {themes.map((item) => {
          const active = theme === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTheme(item.id)}
              className={cn(
                "group relative flex flex-col items-center rounded-xl border p-4 text-center transition-all cursor-pointer",
                active
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                  : "border-border/60 bg-card hover:border-border hover:bg-accent/40",
              )}
            >
              {/* Preview Box */}
              <div
                className={cn(
                  "relative mb-3 flex h-20 w-full items-center justify-center overflow-hidden rounded-lg border text-xs shadow-2xs transition-transform group-hover:scale-[1.02]",
                  item.id === "light" &&
                    "border-border/80 bg-[#faf9f7] text-[#1f1d1a]",
                  item.id === "dark" &&
                    "border-border/40 bg-[#0d0c0b] text-[#edece9]",
                  item.id === "system" &&
                    "border-border/60 bg-gradient-to-r from-[#faf9f7] from-50% to-[#0d0c0b] to-50%",
                )}
              >
                {/* Visual miniature layout */}
                <div
                  className={cn(
                    "flex flex-col items-center gap-1.5",
                    item.id === "system" && "drop-shadow-sm",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border shadow-2xs",
                      item.id === "light" &&
                        "border-amber-200 bg-amber-50 text-amber-600",
                      item.id === "dark" &&
                        "border-slate-700 bg-slate-800 text-slate-200",
                      item.id === "system" &&
                        "border-border/60 bg-background/90 text-foreground backdrop-blur-xs",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                </div>

                {active && (
                  <div className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
                    <CheckIcon className="size-3 stroke-[2.5]" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                <span>{item.label}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                {item.description}
              </p>
            </button>
          );
        })}
      </div>

      <SettingsSectionGroup title={t("theme.previewDetails")}>
        <div className="flex items-center justify-between px-4 py-3 text-xs">
          <span className="text-muted-foreground">
            {t("theme.shortcutTip")}
          </span>
          <kbd className="inline-flex h-5 items-center rounded border border-border/80 bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            D
          </kbd>
        </div>
      </SettingsSectionGroup>
    </div>
  );
}
