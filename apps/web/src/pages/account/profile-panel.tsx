import { UserRoundIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TranslationKey, TranslationParams } from "@/i18n";
import { SettingsRow, SettingsSectionGroup } from "./apple-settings-ui";

type ProfilePanelProps = {
  currentUsername: string;
  error: string | null;
  isPending: boolean;
  /** Absolute expiry of the viewer's reader seat (ISO string), or null when not a reader / no expiry. */
  readerExpiry?: string | null;
  setUsername: (value: string) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  username: string;
  onSubmit: () => Promise<void>;
};

export function ProfilePanel({
  currentUsername,
  error,
  isPending,
  readerExpiry,
  setUsername,
  t,
  username,
  onSubmit,
}: ProfilePanelProps) {
  const [open, setOpen] = useState(false);
  const wasPending = useRef(false);

  // Close only after a successful save: pending -> idle with no error.
  useEffect(() => {
    if (wasPending.current && !isPending && !error) setOpen(false);
    wasPending.current = isPending;
  }, [isPending, error]);

  const expiryDate = readerExpiry ? new Date(readerExpiry) : null;
  const expiryLabel =
    expiryDate && !Number.isNaN(expiryDate.getTime())
      ? expiryDate.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;

  return (
    <div className="flex flex-col gap-5">
      <SettingsSectionGroup
        title={t("settings.nav.profile")}
        footer={
          expiryLabel ? (
            <span>{t("account.readerUntil", { date: expiryLabel })}</span>
          ) : undefined
        }
      >
        <SettingsRow
          icon={UserRoundIcon}
          iconColor="bg-muted text-muted-foreground"
          label={t("auth.usernameHandle")}
          value={currentUsername || "—"}
          chevron
          onClick={() => setOpen(true)}
        />
      </SettingsSectionGroup>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("auth.profileTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit();
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-username"
            >
              {t("auth.usernameHandle")}
              <Input
                autoCapitalize="none"
                autoComplete="username"
                disabled={isPending}
                id="account-username"
                maxLength={30}
                minLength={3}
                pattern="[A-Za-z0-9_]+"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter className="mt-2">
              <Button
                disabled={isPending}
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? t("auth.saving") : t("auth.saveUsername")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
