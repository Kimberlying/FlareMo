import { RefreshCcwIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import type { TranslationKey } from "@/i18n";
import { SettingsRow, SettingsSectionGroup } from "./apple-settings-ui";

export const MIN_PASSWORD_LENGTH = 8;

type SecurityPanelProps = {
  changeEmailIsPending: boolean;
  changePasswordIsPending: boolean;
  currentEmail: string;
  /** True when the deployment runs FLAREMO_EMAIL_PROVIDER=none. */
  emailProviderDisabled?: boolean;
  currentPassword: string;
  deleteAccountIsPending: boolean;
  deleteError: string | null;
  deletePassword: string;
  emailCurrentPassword: string;
  emailError: string | null;
  emailVerificationPending: boolean;
  isOwner: boolean;
  newPassword: string;
  newPasswordConfirmation: string;
  passwordError: string | null;
  setCurrentPassword: (value: string) => void;
  setDeletePassword: (value: string) => void;
  setEmailCurrentPassword: (value: string) => void;
  setNewEmail: (value: string) => void;
  setNewPassword: (value: string) => void;
  setNewPasswordConfirmation: (value: string) => void;
  t: (key: TranslationKey) => string;
  newEmail: string;
  onEmailSubmit: () => Promise<void>;
  onPasswordSubmit: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
};

function useCloseOnSuccess(
  isPending: boolean,
  hasError: boolean,
  close: () => void,
) {
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !hasError) close();
    wasPending.current = isPending;
  }, [isPending, hasError, close]);
}

export function SecurityPanel({
  emailProviderDisabled,
  changeEmailIsPending,
  changePasswordIsPending,
  currentEmail,
  currentPassword,
  deleteAccountIsPending,
  deleteError,
  deletePassword,
  emailCurrentPassword,
  emailError,
  emailVerificationPending,
  isOwner,
  newPassword,
  newPasswordConfirmation,
  passwordError,
  setCurrentPassword,
  setDeletePassword,
  setEmailCurrentPassword,
  setNewEmail,
  setNewPassword,
  setNewPasswordConfirmation,
  t,
  newEmail,
  onEmailSubmit,
  onPasswordSubmit,
  onDeleteAccount,
}: SecurityPanelProps) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useCloseOnSuccess(changePasswordIsPending, passwordError !== null, () =>
    setPasswordOpen(false),
  );
  useCloseOnSuccess(changeEmailIsPending, emailError !== null, () =>
    setEmailOpen(false),
  );

  return (
    <div className="flex flex-col gap-5">
      <SettingsSectionGroup
        title={t("settings.nav.security")}
        footer={
          emailProviderDisabled
            ? t("auth.noEmailProviderNote")
            : emailVerificationPending
              ? t("auth.emailChangeVerificationSent")
              : undefined
        }
      >
        <SettingsRow
          icon={ShieldCheckIcon}
          label={t("auth.emailTitle")}
          value={currentEmail || "—"}
          chevron
          onClick={() => setEmailOpen(true)}
        />
        <SettingsRow
          icon={ShieldCheckIcon}
          label={t("auth.passwordTitle")}
          value="••••••••"
          chevron
          onClick={() => setPasswordOpen(true)}
        />
      </SettingsSectionGroup>

      {!isOwner && (
        <SettingsSectionGroup title={t("common.actions")}>
          <SettingsRow
            destructive
            label={t("auth.deleteAccountTitle")}
            onClick={() => setDeleteOpen(true)}
          />
        </SettingsSectionGroup>
      )}

      {/* Password Change Dialog */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("auth.passwordTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onPasswordSubmit();
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-current-password"
            >
              {t("auth.currentPassword")}
              <PasswordInput
                autoComplete="current-password"
                disabled={changePasswordIsPending}
                id="account-current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-new-password"
            >
              {t("auth.newPassword")}
              <PasswordInput
                autoComplete="new-password"
                disabled={changePasswordIsPending}
                id="account-new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-password-confirmation"
            >
              {t("auth.confirmPassword")}
              <PasswordInput
                autoComplete="new-password"
                disabled={changePasswordIsPending}
                id="account-password-confirmation"
                minLength={MIN_PASSWORD_LENGTH}
                required
                value={newPasswordConfirmation}
                onChange={(event) =>
                  setNewPasswordConfirmation(event.target.value)
                }
              />
            </label>
            {passwordError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {passwordError}
              </p>
            )}
            <DialogFooter className="mt-2">
              <Button
                disabled={changePasswordIsPending}
                type="button"
                variant="outline"
                onClick={() => setPasswordOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={changePasswordIsPending} type="submit">
                {changePasswordIsPending && (
                  <RefreshCcwIcon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("auth.changePassword")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Email Change Dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("auth.emailTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onEmailSubmit();
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-email-password"
            >
              {t("auth.currentPassword")}
              <PasswordInput
                autoComplete="current-password"
                disabled={changeEmailIsPending}
                id="account-email-password"
                required
                value={emailCurrentPassword}
                onChange={(event) =>
                  setEmailCurrentPassword(event.target.value)
                }
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-new-email"
            >
              {t("auth.newEmail")}
              <Input
                autoCapitalize="none"
                autoComplete="email"
                disabled={changeEmailIsPending}
                id="account-new-email"
                required
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
              />
            </label>
            {emailError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {emailError}
              </p>
            )}
            <DialogFooter className="mt-2">
              <Button
                disabled={changeEmailIsPending}
                type="button"
                variant="outline"
                onClick={() => setEmailOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={changeEmailIsPending} type="submit">
                {changeEmailIsPending && (
                  <RefreshCcwIcon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("auth.changeEmail")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Account Alert Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("auth.deleteAccountTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("auth.deleteAccountDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="delete-account-password"
            >
              {t("auth.deleteAccountPassword")}
              <PasswordInput
                autoComplete="current-password"
                disabled={deleteAccountIsPending}
                id="delete-account-password"
                required
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </label>
            {deleteError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteAccountIsPending}
              variant="ghost"
              onClick={() => {
                setDeletePassword("");
              }}
            >
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteAccountIsPending || !deletePassword}
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void onDeleteAccount().then(() => {
                  if (!deleteError) setDeleteOpen(false);
                });
              }}
            >
              {deleteAccountIsPending && (
                <RefreshCcwIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("auth.deleteAccountSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
