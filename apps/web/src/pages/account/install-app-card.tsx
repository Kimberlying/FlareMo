import {
  AppWindowIcon,
  CheckCircleIcon,
  DownloadIcon,
  WifiOffIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa";
import { useI18n } from "@/i18n";
import { SettingsRow, SettingsSectionGroup } from "./apple-settings-ui";

export function InstallAppCard() {
  const { t } = useI18n();
  const {
    canPromptInstall,
    isInstalled,
    promptInstall,
    shouldOfferInstall,
    dismissInstall,
  } = usePwaInstall();

  const isOfflineCapable =
    typeof navigator === "undefined" || "serviceWorker" in navigator;

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "unavailable") {
      toast.error(t("pwa.installUnavailable"));
    }
  };

  if (isInstalled) {
    return (
      <div className="flex flex-col gap-5">
        <SettingsSectionGroup
          title={t("settings.nav.install")}
          footer={t("pwa.installedDescription")}
        >
          <SettingsRow
            icon={CheckCircleIcon}
            label={t("pwa.installedTitle")}
            value={t("settings.status.configured")}
          />
        </SettingsSectionGroup>
      </div>
    );
  }

  if (!shouldOfferInstall) {
    if (!isOfflineCapable) return null;
    return (
      <div className="flex flex-col gap-5">
        <SettingsSectionGroup
          title={t("settings.nav.install")}
          footer={t("pwa.offlineDescription")}
        >
          <SettingsRow icon={WifiOffIcon} label={t("pwa.offlineTitle")} />
        </SettingsSectionGroup>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingsSectionGroup
        title={t("settings.nav.install")}
        footer={
          canPromptInstall ? t("pwa.installDescription") : t("pwa.iosHint")
        }
      >
        <SettingsRow
          icon={AppWindowIcon}
          label={t("pwa.installTitle")}
          action={
            <div className="flex items-center gap-2">
              {canPromptInstall && (
                <Button size="sm" onClick={() => void handleInstall()}>
                  <DownloadIcon data-icon="inline-start" />
                  {t("pwa.installButton")}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground"
                onClick={dismissInstall}
              >
                {t("pwa.dismiss")}
              </Button>
            </div>
          }
        />
      </SettingsSectionGroup>
    </div>
  );
}
