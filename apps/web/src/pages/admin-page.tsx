import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CrownIcon,
  EyeIcon,
  EyeOffIcon,
  ImageUpIcon,
  KeyRoundIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type AdminBranding,
  type AdminUser,
  type BrandingAssetKind,
  type BrandingMarkVariant,
  clearAdminBrandingFavicon,
  clearAdminBrandingMark,
  createAdminUser,
  deleteAdminUser,
  getAdminBranding,
  getCurrentFlareMoUser,
  listAdminUsers,
  requestAdminPasswordReset,
  revokeAdminUserReader,
  setAdminUserReader,
  updateAdminBrandingAccent,
  updateAdminBrandingProductName,
  updateAdminUserRole,
  uploadAdminBrandingFavicon,
  uploadAdminBrandingMark,
} from "@/api";
import {
  BRANDING_ACCENT_CHOICES,
  type BrandingAccent,
  setAccentAttribute,
} from "@/branding";
import { InfoTip } from "@/components/info-tip";
import { SecretRevealDialog } from "@/components/secret-reveal-dialog";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/key";
import { normalizeHexColor } from "@/lib/brand-ramp";
import { errorMessage } from "@/lib/error";
import { cn } from "@/lib/utils";

export function AdminPanel() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [roleFilter, setRoleFilter] = useState<
    "all" | "owner" | "admin" | "member" | "reader"
  >("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: listAdminUsers,
    retry: false,
  });
  const meQuery = useQuery({
    // Same key as the account page's viewer cache so both views invalidate
    // together after a role change.
    queryKey: ["current-flaremo-user"],
    queryFn: getCurrentFlareMoUser,
  });
  // The role matrix the server enforces: only the team owner changes roles,
  // and only the owner resets another administrator's password or removes one.
  const isTeamOwner = meQuery.data?.role === "owner";

  const createUserMutation = useMutation({
    mutationFn: createAdminUser,
    onSuccess: () => {
      setName("");
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const deleteUserMutation = useMutation({
    mutationFn: deleteAdminUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "admin" | "member" }) =>
      updateAdminUserRole(id, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({
        queryKey: ["current-flaremo-user"],
      });
    },
  });
  const setReaderMutation = useMutation({
    mutationFn: ({ id, expiresAt }: { id: string; expiresAt: string | null }) =>
      setAdminUserReader(id, expiresAt),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({
        queryKey: ["current-flaremo-user"],
      });
    },
  });
  const revokeReaderMutation = useMutation({
    mutationFn: (id: string) => revokeAdminUserReader(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({
        queryKey: ["current-flaremo-user"],
      });
    },
  });

  const handleCreateUser = async () => {
    setCreateError(null);
    try {
      const result = await createUserMutation.mutateAsync({
        name: name.trim(),
        email: email.trim(),
      });
      setCreatedLink(`${window.location.origin}${result.activation_path}`);
      setCopied(false);
      setCreateOpen(false);
    } catch (error) {
      setCreateError(errorMessage(error, t("admin.userCreateFailed")));
    }
  };

  // Row-action failures surface as toasts: the create dialog's error slot is
  // only rendered while that dialog is open, so writing row failures there
  // made them invisible.
  const handleDeleteUser = async (user: AdminUser) => {
    try {
      await deleteUserMutation.mutateAsync(user.id);
    } catch (error) {
      toast.error(errorMessage(error, t("admin.userDeleteFailed")));
    }
  };

  const handleResetPassword = async (user: AdminUser) => {
    try {
      const result = await requestAdminPasswordReset(user.id);
      const base = window.location.origin;
      setResetLink(`${base}${result.reset_path}`);
      setCopied(false);
    } catch (error) {
      toast.error(errorMessage(error, t("admin.resetFailed")));
    }
  };

  const handleUpdateRole = async (user: AdminUser) => {
    if (!isTeamOwner) return;
    try {
      await updateRoleMutation.mutateAsync({
        id: user.id,
        role: user.role === "admin" ? "member" : "admin",
      });
    } catch (error) {
      toast.error(errorMessage(error, t("admin.roleUpdateFailed")));
    }
  };

  // Renewal extends from max(now, current expiry) so topping up an active
  // seat never discards the days already paid for.
  const readerExpiryBase = (user: AdminUser): number => {
    const current = user.reader_expires_at
      ? new Date(user.reader_expires_at).getTime()
      : Number.NaN;
    return Number.isNaN(current) ? Date.now() : Math.max(Date.now(), current);
  };

  const handleSetReader = async (user: AdminUser, days: number) => {
    try {
      await setReaderMutation.mutateAsync({
        id: user.id,
        expiresAt: new Date(
          readerExpiryBase(user) + days * 86_400_000,
        ).toISOString(),
      });
    } catch (error) {
      toast.error(errorMessage(error, t("admin.readerSetFailed")));
    }
  };

  const handleRevokeReader = async (user: AdminUser) => {
    try {
      await revokeReaderMutation.mutateAsync(user.id);
    } catch (error) {
      toast.error(errorMessage(error, t("admin.readerRevokeFailed")));
    }
  };

  const handleCopyResetLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      toast.error(t("admin.resetCopyFailed"));
    }
  };

  const allUsers = useMemo(
    () => usersQuery.data?.users ?? [],
    [usersQuery.data?.users],
  );

  const counts = useMemo(() => {
    const res = {
      all: allUsers.length,
      owner: 0,
      admin: 0,
      member: 0,
      reader: 0,
    };
    for (const u of allUsers) {
      if (u.role === "owner") res.owner += 1;
      else if (u.role === "admin") res.admin += 1;
      else if (u.role === "reader") res.reader += 1;
      else res.member += 1;
    }
    return res;
  }, [allUsers]);

  const filteredMembers = useMemo(() => {
    return allUsers.filter((user) => {
      if (roleFilter !== "all") {
        if (
          roleFilter === "member" &&
          user.role !== "member" &&
          user.role !== null
        ) {
          return false;
        }
        if (roleFilter !== "member" && user.role !== roleFilter) {
          return false;
        }
      }
      if (memberSearch.trim()) {
        const q = memberSearch.trim().toLowerCase();
        const match =
          user.name?.toLowerCase().includes(q) ||
          user.email?.toLowerCase().includes(q) ||
          user.username?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [allUsers, roleFilter, memberSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMembers.slice(start, start + pageSize);
  }, [filteredMembers, currentPage, pageSize]);

  const getReaderStatus = (user: AdminUser) => {
    if (user.role !== "reader" || !user.reader_expires_at) return null;
    const expiry = new Date(user.reader_expires_at).getTime();
    if (Number.isNaN(expiry)) return null;
    const now = Date.now();
    const diffDays = Math.ceil((expiry - now) / 86_400_000);
    return {
      expired: diffDays <= 0,
      days: diffDays,
      dateFormatted: formatDate(user.reader_expires_at),
    };
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>{t("admin.usersTitle")}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("admin.userCount", { count: String(allUsers.length) })}
            </p>
          </div>
          <Button
            size="sm"
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreatedLink(null);
              setCreateOpen(true);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            {t("admin.createUser")}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0">
          {/* Filter & Toolbar Area */}
          <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
            {/* Role Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: t("admin.filterAll"), count: counts.all },
                  {
                    id: "owner",
                    label: t("admin.role.owner"),
                    count: counts.owner,
                  },
                  {
                    id: "admin",
                    label: t("admin.role.admin"),
                    count: counts.admin,
                  },
                  {
                    id: "member",
                    label: t("admin.role.member"),
                    count: counts.member,
                  },
                  {
                    id: "reader",
                    label: t("admin.role.reader"),
                    count: counts.reader,
                  },
                ] as const
              ).map((tab) => {
                const active = roleFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setRoleFilter(tab.id);
                      setPage(1);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                      active
                        ? "bg-primary text-primary-foreground shadow-2xs"
                        : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground border border-border/40",
                    )}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums leading-none",
                        active
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search + Page Size */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="relative min-w-[200px] flex-1 max-w-sm">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label={t("admin.memberSearchPlaceholder")}
                  className="h-8.5 pl-8 pr-8 text-xs bg-background"
                  placeholder={t("admin.memberSearchPlaceholder")}
                  value={memberSearch}
                  onChange={(event) => {
                    setMemberSearch(event.target.value);
                    setPage(1);
                  }}
                />
                {memberSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setMemberSearch("");
                      setPage(1);
                    }}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("admin.pageSizeLabel")}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-8.5 rounded-lg border border-border/60 bg-background px-2 text-xs text-foreground outline-hidden focus:border-ring"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>

          {/* Members Table */}
          <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xs">
            {usersQuery.isLoading && (
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            )}
            {usersQuery.isError && (
              <p className="p-4 text-sm text-destructive">
                {t("admin.usersLoadFailed")}
              </p>
            )}
            {usersQuery.data && (
              <>
                <div className="divide-y divide-border/40">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 items-center bg-muted/40 px-3.5 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <div className="col-span-5 sm:col-span-5">
                      {t("admin.columnMember")}
                    </div>
                    <div className="col-span-3 sm:col-span-3">
                      {t("admin.columnRole")}
                    </div>
                    <div className="col-span-3 sm:col-span-3">
                      {t("admin.columnExpiry")}
                    </div>
                    <div className="col-span-1 text-right">
                      {t("admin.columnActions")}
                    </div>
                  </div>

                  {/* Rows */}
                  {pagedMembers.map((user) => {
                    const readerStatus = getReaderStatus(user);
                    const isSelf = meQuery.data?.id === user.id;
                    return (
                      <div
                        key={user.id}
                        className="grid grid-cols-12 items-center px-3.5 py-2.5 transition-colors hover:bg-accent/30"
                      >
                        {/* Member identity */}
                        <div className="col-span-5 sm:col-span-5 flex items-center gap-2.5 min-w-0 pr-2">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {(user.name || user.username || "?")
                              .slice(0, 1)
                              .toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="truncate text-xs font-semibold text-foreground">
                                {user.name}
                              </span>
                              {isSelf && (
                                <span className="rounded bg-primary/10 px-1 py-0.2 text-[10px] font-normal text-primary">
                                  {t("admin.selfBadge")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                              <span>@{user.username}</span>
                              <span>·</span>
                              <span className="truncate">{user.email}</span>
                            </div>
                          </div>
                        </div>

                        {/* Role */}
                        <div className="col-span-3 sm:col-span-3 flex items-center">
                          {user.role === "owner" ? (
                            <Badge
                              variant="secondary"
                              className="gap-1 border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium"
                            >
                              <CrownIcon className="size-3" />
                              <span>{t("admin.role.owner")}</span>
                            </Badge>
                          ) : user.role === "admin" ? (
                            <Badge
                              variant="secondary"
                              className="gap-1 border-primary/20 bg-primary/10 text-primary font-medium"
                            >
                              <ShieldCheckIcon className="size-3" />
                              <span>{t("admin.role.admin")}</span>
                            </Badge>
                          ) : user.role === "reader" ? (
                            <Badge
                              variant="secondary"
                              className="gap-1 border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                            >
                              <EyeIcon className="size-3" />
                              <span>{t("admin.role.reader")}</span>
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="gap-1 text-muted-foreground font-normal"
                            >
                              <UserIcon className="size-3" />
                              <span>{t("admin.role.member")}</span>
                            </Badge>
                          )}
                        </div>

                        {/* Status / Expiry / Join Date */}
                        <div className="col-span-3 sm:col-span-3 text-xs text-muted-foreground truncate">
                          {user.role === "reader" && readerStatus ? (
                            readerStatus.expired ? (
                              <Badge
                                variant="destructive"
                                className="h-5 px-1.5 text-[10px]"
                              >
                                {t("admin.expired")} (
                                {readerStatus.dateFormatted})
                              </Badge>
                            ) : (
                              <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                {t("admin.daysLeft", {
                                  days: String(readerStatus.days),
                                })}
                              </span>
                            )
                          ) : (
                            <span className="text-[11px]">
                              {formatDate(user.created_at)}
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="col-span-1 flex justify-end">
                          {user.role !== "owner" ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    aria-label={t("admin.memberActions")}
                                    size="icon-sm"
                                    type="button"
                                    variant="ghost"
                                    className="size-7"
                                  >
                                    <MoreHorizontalIcon className="size-4" />
                                  </Button>
                                }
                              />
                              <DropdownMenuContent align="end">
                                {isTeamOwner && (
                                  <DropdownMenuItem
                                    onClick={() => void handleUpdateRole(user)}
                                  >
                                    <UserCogIcon />
                                    {user.role === "admin"
                                      ? t("admin.makeMember")
                                      : t("admin.makeAdmin")}
                                  </DropdownMenuItem>
                                )}
                                {(user.role === "member" ||
                                  user.role === "reader" ||
                                  user.role === null) && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        void handleSetReader(user, 30)
                                      }
                                    >
                                      <EyeIcon />
                                      {user.role === "reader"
                                        ? t("admin.renewReader30")
                                        : t("admin.makeReader30")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        void handleSetReader(user, 365)
                                      }
                                    >
                                      <EyeIcon />
                                      {user.role === "reader"
                                        ? t("admin.renewReader365")
                                        : t("admin.makeReader365")}
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {user.role === "reader" && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      void handleRevokeReader(user)
                                    }
                                  >
                                    <EyeOffIcon />
                                    {t("admin.revokeReader")}
                                  </DropdownMenuItem>
                                )}
                                {(isTeamOwner || user.role === "member") && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      void handleResetPassword(user)
                                    }
                                  >
                                    <KeyRoundIcon />
                                    {t("admin.resetPassword")}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setDeleteTarget(user)}
                                >
                                  <Trash2Icon />
                                  {t("admin.deleteUser")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="size-7" />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Empty state */}
                  {filteredMembers.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                      <UsersIcon className="size-8 text-muted-foreground/40" />
                      <p className="text-xs text-muted-foreground">
                        {t("admin.memberSearchEmpty")}
                      </p>
                      {(memberSearch || roleFilter !== "all") && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            setMemberSearch("");
                            setRoleFilter("all");
                            setPage(1);
                          }}
                        >
                          {t("admin.clearFilters")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Pagination Footer */}
                {filteredMembers.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
                    <div>
                      {t("admin.pageRangeInfo", {
                        from: String((currentPage - 1) * pageSize + 1),
                        to: String(
                          Math.min(
                            currentPage * pageSize,
                            filteredMembers.length,
                          ),
                        ),
                        total: String(filteredMembers.length),
                      })}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={currentPage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        title={t("admin.pagePrev")}
                      >
                        <ChevronLeftIcon className="size-3.5" />
                      </Button>

                      <span className="px-2 font-medium tabular-nums text-foreground">
                        {currentPage} / {totalPages}
                      </span>

                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={currentPage >= totalPages}
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                        title={t("admin.pageNext")}
                      >
                        <ChevronRightIcon className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.deleteUser")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) void handleDeleteUser(deleteTarget);
              }}
            >
              {t("admin.deleteUser")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.createUser")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateUser();
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="admin-name"
            >
              {t("auth.displayName")}
              <Input
                autoFocus
                autoComplete="off"
                disabled={createUserMutation.isPending}
                id="admin-name"
                maxLength={80}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="admin-email"
            >
              {t("auth.email")}
              <Input
                autoComplete="off"
                disabled={createUserMutation.isPending}
                id="admin-email"
                maxLength={320}
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <p className="flex items-center gap-1 text-xs leading-5 text-muted-foreground">
              <InfoTip text={t("admin.activationDescription")} />
              <span className="sr-only">
                {t("admin.activationDescription")}
              </span>
            </p>
            {createError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {createError}
              </p>
            )}
            <DialogFooter>
              <Button
                disabled={createUserMutation.isPending}
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={createUserMutation.isPending} type="submit">
                {createUserMutation.isPending && (
                  <Loader2Icon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {createUserMutation.isPending
                  ? t("admin.creatingUser")
                  : t("admin.createUser")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SecretRevealDialog
        closeLabelKey="common.close"
        copied={copied}
        copyLabelKey="admin.copyResetLink"
        description={t("admin.activationDescription")}
        onCopy={() => {
          if (createdLink) void handleCopyResetLink(createdLink);
        }}
        onOpenChange={(open) => {
          if (!open) setCreatedLink(null);
        }}
        open={createdLink !== null}
        t={t}
        titleKey="admin.userCreatedTitle"
        value={createdLink ?? ""}
      />

      <SecretRevealDialog
        closeLabelKey="admin.hideResetLink"
        copied={copied}
        copyLabelKey="admin.copyResetLink"
        description={t("admin.resetLinkDescription")}
        onCopy={() => {
          if (resetLink) void handleCopyResetLink(resetLink);
        }}
        onOpenChange={(open) => {
          if (!open) setResetLink(null);
        }}
        open={resetLink !== null}
        t={t}
        titleKey="admin.resetLinkTitle"
        value={resetLink ?? ""}
      />
    </div>
  );
}

const ACCEPTED_MARK_TYPES = "image/png,image/webp,image/svg+xml";
const ACCEPTED_FAVICON_TYPES =
  "image/png,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon";

/** Swatch dots are fixed hex so the palette reads the same in any theme. */
const ACCENT_SWATCH_HEX: Record<Exclude<BrandingAccent, "custom">, string> = {
  flame: "#ff6a00",
  ocean: "#0090ff",
  indigo: "#3e63dd",
  iris: "#5b5bd6",
  jade: "#29a383",
  teal: "#12a594",
  crimson: "#e93d82",
  amber: "#ffc53d",
};

function accentSummaryLabel(
  accent: string | null | undefined,
  accentHex: string | null | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (accent === "custom") {
    const base = t("admin.branding.accentCustom");
    return accentHex ? `${base} · ${accentHex}` : base;
  }
  const preset = accent ?? "flame";
  return t(`admin.branding.accent_${preset}` as TranslationKey);
}

function AccentPicker({
  value,
  customHex,
  disabled,
  onSelect,
}: {
  value: string;
  customHex: string | null;
  disabled: boolean;
  onSelect: (accent: BrandingAccent) => void;
}) {
  const { t } = useI18n();
  const isCustom = value === "custom";
  return (
    <fieldset
      aria-label={t("admin.branding.accent")}
      className="flex flex-wrap gap-2 border-0 p-0"
    >
      {BRANDING_ACCENT_CHOICES.map((accent) => {
        if (accent === "custom") {
          return (
            <button
              key={accent}
              aria-label={t("admin.branding.accentCustom")}
              aria-pressed={isCustom}
              className="size-6 shrink-0 rounded-full border transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 data-[active=true]:ring-[2px] data-[active=true]:ring-ring data-[active=true]:ring-offset-2 data-[active=true]:ring-offset-background"
              data-active={isCustom}
              disabled={disabled}
              style={{
                background:
                  isCustom && customHex
                    ? customHex
                    : "conic-gradient(from 140deg, #f43f5e, #f97316, #facc15, #4ade80, #22d3ee, #818cf8, #e879f9, #f43f5e)",
              }}
              title={t("admin.branding.accentCustom")}
              type="button"
              onClick={() => onSelect(accent)}
            />
          );
        }
        const active = accent === value;
        return (
          <button
            key={accent}
            aria-label={t(`admin.branding.accent_${accent}`)}
            aria-pressed={active}
            className="size-6 shrink-0 rounded-full border transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 data-[active=true]:ring-[2px] data-[active=true]:ring-ring data-[active=true]:ring-offset-2 data-[active=true]:ring-offset-background"
            data-active={active}
            disabled={disabled}
            style={{ backgroundColor: ACCENT_SWATCH_HEX[accent] }}
            title={t(`admin.branding.accent_${accent}`)}
            type="button"
            onClick={() => onSelect(accent)}
          />
        );
      })}
    </fieldset>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/**
 * Seed-color editor for the custom accent. Any valid 6-digit hex applies to
 * the whole page instantly (the derived ramp paints live); the PUT is
 * debounced, and closing the dialog flushes a valid unsaved draft.
 */
function CustomAccentDialog({
  draft,
  onDraftChange,
  onOpenChange,
  onSave,
  open,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: (hex: string) => Promise<unknown>;
  open: boolean;
}) {
  const { t } = useI18n();
  const lastSavedRef = useRef<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    if (!open) return undefined;
    const hex = normalizeHexColor(draft);
    if (!hex) return undefined;
    // Live preview beats the network: repaint the whole page immediately,
    // persist on a debounce so typing never floods the API.
    setAccentAttribute("custom", hex);
    if (hex === lastSavedRef.current) return undefined;
    const timer = setTimeout(() => {
      lastSavedRef.current = hex;
      void saveRef.current(hex);
    }, 600);
    return () => clearTimeout(timer);
  }, [draft, open]);

  const flush = () => {
    const hex = normalizeHexColor(draftRef.current);
    if (hex && hex !== lastSavedRef.current) {
      lastSavedRef.current = hex;
      void onSave(hex);
    }
  };

  const valid = normalizeHexColor(draft);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) flush();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("admin.branding.accentCustom")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <input
              aria-label={t("admin.branding.accentPick")}
              className="size-12 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
              type="color"
              value={valid ?? "#ff6a00"}
              onChange={(event) => onDraftChange(event.target.value)}
            />
            <Input
              aria-label={t("admin.branding.accentHex")}
              autoComplete="off"
              className="font-mono"
              placeholder="#7c3aed"
              spellCheck={false}
              value={draft}
              aria-invalid={draft.length > 0 && !valid}
              onChange={(event) => onDraftChange(event.target.value)}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {valid
              ? t("admin.branding.accentHint")
              : t("admin.branding.accentHexHint")}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BrandingCard() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [productName, setProductName] = useState("");
  const lightInputRef = useRef<HTMLInputElement>(null);
  const darkInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const brandingQuery = useQuery({
    queryKey: ["admin-branding"],
    queryFn: getAdminBranding,
    retry: false,
  });

  useEffect(() => {
    if (brandingQuery.data) {
      setProductName(brandingQuery.data.product_name ?? "");
    }
  }, [brandingQuery.data]);

  const saveNameMutation = useMutation({
    mutationFn: () =>
      updateAdminBrandingProductName(productName.trim() || null),
    onSuccess: () => {
      toast.success(t("admin.branding.saved"));
      void queryClient.invalidateQueries({ queryKey: ["admin-branding"] });
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.branding.failed"))),
  });

  const saveAccentMutation = useMutation({
    mutationFn: ({
      accent,
      accentHex,
    }: {
      accent: BrandingAccent;
      accentHex?: string | null;
    }) => updateAdminBrandingAccent(accent, accentHex ?? null),
    onMutate: ({ accent, accentHex }) => {
      // Swatches are instant-apply: paint the choice while the PUT runs.
      setAccentAttribute(accent, accentHex ?? undefined);
    },
    onSuccess: (_data, { accent, accentHex }) => {
      queryClient.setQueryData<AdminBranding>(["admin-branding"], (current) =>
        current
          ? { ...current, accent, accent_hex: accentHex ?? null }
          : current,
      );
      setAccentAttribute(accent, accentHex ?? undefined);
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.branding.failed"))),
  });

  const uploadMarkMutation = useMutation({
    mutationFn: ({
      variant,
      file,
    }: {
      variant: BrandingMarkVariant;
      file: File;
    }) => uploadAdminBrandingMark(variant, file),
    onSuccess: () => {
      toast.success(t("admin.branding.markUploaded"));
      void queryClient.invalidateQueries({ queryKey: ["admin-branding"] });
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.branding.failed"))),
  });

  const uploadFaviconMutation = useMutation({
    mutationFn: (file: File) => uploadAdminBrandingFavicon(file),
    onSuccess: () => {
      toast.success(t("admin.branding.faviconUploaded"));
      void queryClient.invalidateQueries({ queryKey: ["admin-branding"] });
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.branding.failed"))),
  });

  const clearMarkMutation = useMutation({
    mutationFn: (variant: BrandingMarkVariant) =>
      clearAdminBrandingMark(variant),
    onSuccess: () => {
      toast.success(t("admin.branding.markRemoved"));
      void queryClient.invalidateQueries({ queryKey: ["admin-branding"] });
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.branding.failed"))),
  });

  const clearFaviconMutation = useMutation({
    mutationFn: () => clearAdminBrandingFavicon(),
    onSuccess: () => {
      toast.success(t("admin.branding.faviconRemoved"));
      void queryClient.invalidateQueries({ queryKey: ["admin-branding"] });
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.branding.failed"))),
  });

  const handleFileChange = (
    kind: BrandingAssetKind,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (kind === "favicon") {
      void uploadFaviconMutation.mutateAsync(file);
    } else {
      void uploadMarkMutation.mutateAsync({ variant: kind, file });
    }
  };

  const renderMarkRow = (
    kind: BrandingAssetKind,
    label: string,
    url: string | null,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) => (
    <div className="flex items-center gap-3">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/40 dark:bg-muted/20">
        {url ? (
          <img alt="" className="size-8 object-contain" src={url} />
        ) : (
          <ImageUpIcon className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <div className="mt-1 flex gap-2">
          <input
            accept={
              kind === "favicon" ? ACCEPTED_FAVICON_TYPES : ACCEPTED_MARK_TYPES
            }
            className="hidden"
            ref={inputRef}
            type="file"
            onChange={(event) => handleFileChange(kind, event)}
          />
          <Button
            disabled={
              kind === "favicon"
                ? uploadFaviconMutation.isPending
                : uploadMarkMutation.isPending
            }
            size="sm"
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            {url ? t("admin.branding.replace") : t("admin.branding.upload")}
          </Button>
          {url && (
            <Button
              disabled={
                kind === "favicon"
                  ? clearFaviconMutation.isPending
                  : clearMarkMutation.isPending
              }
              size="sm"
              type="button"
              variant="ghost"
              onClick={() =>
                kind === "favicon"
                  ? void clearFaviconMutation.mutateAsync()
                  : void clearMarkMutation.mutateAsync(kind)
              }
            >
              <Trash2Icon data-icon="inline-start" />
              {t("admin.branding.remove")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("admin.branding.title")}</CardTitle>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setEditOpen(true)}
        >
          <PencilIcon data-icon="inline-start" />
          {t("common.edit")}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t("admin.branding.accent")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <AccentPicker
                customHex={brandingQuery.data?.accent_hex ?? null}
                disabled={saveAccentMutation.isPending}
                value={brandingQuery.data?.accent ?? "flame"}
                onSelect={(accent) => {
                  if (accent === "custom") {
                    setCustomDraft(
                      brandingQuery.data?.accent_hex ??
                        (brandingQuery.data?.accent
                          ? (ACCENT_SWATCH_HEX[
                              brandingQuery.data
                                .accent as keyof typeof ACCENT_SWATCH_HEX
                            ] ?? "#ff6a00")
                          : "#ff6a00"),
                    );
                    setCustomOpen(true);
                    return;
                  }
                  void saveAccentMutation.mutateAsync({ accent });
                }}
              />
              <span className="text-muted-foreground text-sm">
                {accentSummaryLabel(
                  brandingQuery.data?.accent,
                  brandingQuery.data?.accent_hex,
                  t,
                )}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              {t("admin.branding.identity")}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/40 dark:bg-muted/20">
                {brandingQuery.data?.mark_dark_url ? (
                  <img
                    alt=""
                    className="size-8 object-contain"
                    src={brandingQuery.data.mark_dark_url}
                  />
                ) : (
                  <ImageUpIcon className="size-4 text-muted-foreground" />
                )}
              </div>
              <p className="min-w-0 truncate text-sm">
                {brandingQuery.data?.product_name ||
                  t("admin.branding.statusDefault")}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.branding.title")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveNameMutation.mutateAsync();
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="branding-product-name"
            >
              {t("admin.branding.productName")}
              <Input
                autoComplete="off"
                id="branding-product-name"
                maxLength={40}
                placeholder={t("admin.branding.productNamePlaceholder")}
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
              />
            </label>
            {saveNameMutation.isError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {t("admin.branding.failed")}
              </p>
            )}
            <DialogFooter>
              <Button
                disabled={
                  saveNameMutation.isPending ||
                  productName.trim() ===
                    (brandingQuery.data?.product_name ?? "")
                }
                type="submit"
              >
                {saveNameMutation.isPending && (
                  <Loader2Icon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
          <div className="flex flex-col gap-3 border-t pt-3">
            {renderMarkRow(
              "light",
              t("admin.branding.markLight"),
              brandingQuery.data?.mark_light_url ?? null,
              lightInputRef,
            )}
            {renderMarkRow(
              "dark",
              t("admin.branding.markDark"),
              brandingQuery.data?.mark_dark_url ?? null,
              darkInputRef,
            )}
            {renderMarkRow(
              "favicon",
              t("admin.branding.favicon"),
              brandingQuery.data?.favicon_url ?? null,
              faviconInputRef,
            )}
          </div>
        </DialogContent>
      </Dialog>
      <CustomAccentDialog
        draft={customDraft}
        onDraftChange={setCustomDraft}
        onOpenChange={setCustomOpen}
        open={customOpen}
        onSave={(hex) =>
          saveAccentMutation.mutateAsync({ accent: "custom", accentHex: hex })
        }
      />
    </Card>
  );
}
