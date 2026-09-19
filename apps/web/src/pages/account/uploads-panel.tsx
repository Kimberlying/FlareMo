import { AudioLinesIcon, ImageIcon } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n";
import {
  getAudioCompressionEnabled,
  getImageCompressionEnabled,
  setAudioCompressionEnabled,
  setImageCompressionEnabled,
} from "@/lib/upload-settings";
import { SettingsRow, SettingsSectionGroup } from "./apple-settings-ui";

export function UploadsPanel() {
  const { t } = useI18n();
  const [imageCompression, setImageCompressionState] = useState(
    getImageCompressionEnabled(),
  );
  const [audioCompression, setAudioCompressionState] = useState(
    getAudioCompressionEnabled(),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {t("uploads.title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {t("uploads.description")}
        </p>
      </div>

      <SettingsSectionGroup>
        <SettingsRow
          icon={ImageIcon}
          label={t("uploads.imageCompression")}
          description={t("uploads.imageCompressionDescription")}
          action={
            <Switch
              checked={imageCompression}
              onCheckedChange={(checked) => {
                setImageCompressionState(checked);
                setImageCompressionEnabled(checked);
              }}
            />
          }
        />
        <SettingsRow
          icon={AudioLinesIcon}
          label={t("uploads.audioCompression")}
          description={t("uploads.audioCompressionDescription")}
          action={
            <Switch
              checked={audioCompression}
              onCheckedChange={(checked) => {
                setAudioCompressionState(checked);
                setAudioCompressionEnabled(checked);
              }}
            />
          }
        />
      </SettingsSectionGroup>
    </div>
  );
}
