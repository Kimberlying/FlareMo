import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  AtSignIcon,
  CalendarClockIcon,
  ListTodoIcon,
  MessageCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  type AppNotification,
  archiveNotification,
  listNotifications,
} from "@/api";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";
import { formatMemoRelativeTime } from "@/lib/memo";
import { cn, stripResourceName } from "@/lib/utils";

const TYPE_ICONS = {
  daily_review: CalendarClockIcon,
  memo_comment: MessageCircleIcon,
  memo_mention: AtSignIcon,
  task_overdue: ListTodoIcon,
} as const;

const TYPE_LABELS = {
  daily_review: "notifications.type.dailyReview",
  memo_comment: "notifications.type.memoComment",
  memo_mention: "notifications.type.memoMention",
  task_overdue: "notifications.type.taskOverdue",
} as const;

// One shared query for every surface that shows unread state: the user-menu
// badge reads the count while the dialog renders the list itself.
export function useNotifications() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    retry: false,
    refetchInterval: 60_000,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveNotification,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (error) =>
      toast.error(errorMessage(error, t("notifications.archiveFailed"))),
  });

  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadCount = notifications.filter(
    (notification) => notification.status === "unread",
  ).length;

  const openNotification = (notification: AppNotification) => {
    if (notification.status === "unread") {
      archiveMutation.mutate(notification.name);
    }
    if (notification.type === "daily_review") {
      void navigate({ to: "/review/daily" });
      return;
    }
    if (notification.type === "task_overdue") {
      void navigate({ to: "/calendar", search: { date: undefined } });
      return;
    }
    if (!notification.memo) return;
    void navigate({
      to: "/memo/$memoId",
      params: { memoId: stripResourceName(notification.memo, "memos") },
    });
  };

  return {
    notifications,
    unreadCount,
    openNotification,
    isError: notificationsQuery.isError,
    hasData: Boolean(notificationsQuery.data),
    refetch: () => notificationsQuery.refetch(),
    isRefetching: notificationsQuery.isRefetching,
  };
}

// The shared notification body (error / empty / items). Rendered inside the
// user menu's dialog; the sidebar topbar no longer carries a bell of its own.
export function NotificationList({ onNavigate }: { onNavigate?: () => void }) {
  const { locale, t } = useI18n();
  const {
    notifications,
    openNotification,
    isError,
    hasData,
    refetch,
    isRefetching,
  } = useNotifications();

  const activate = (notification: AppNotification) => {
    openNotification(notification);
    onNavigate?.();
  };

  if (isError && !hasData) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-5">
        <p className="text-xs text-muted-foreground">
          {t("list.errorDescription")}
        </p>
        <Button
          disabled={isRefetching}
          onClick={() => void refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  if (notifications.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
        {t("notifications.empty")}
      </p>
    );
  }
  return (
    <div className="flex flex-col">
      {notifications.map((notification) => {
        const Icon = TYPE_ICONS[notification.type];
        const unread = notification.status === "unread";
        return (
          <button
            className="flex items-start gap-2 rounded-md px-2 py-2 text-left outline-none motion-safe:transition-colors motion-safe:duration-150 hover:bg-muted focus-visible:bg-muted"
            key={notification.name}
            type="button"
            onClick={() => activate(notification)}
          >
            <Icon className="mt-0.5 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn(
                  "flex items-center justify-between gap-2 text-xs",
                  unread ? "font-medium" : "text-muted-foreground",
                )}
              >
                {t(TYPE_LABELS[notification.type])}
                <span className="shrink-0 font-normal text-muted-foreground tabular-nums">
                  {formatMemoRelativeTime(notification.create_time, locale)}
                </span>
              </span>
              <span className="line-clamp-2 text-xs break-words text-muted-foreground">
                {notification.memo_snippet}
              </span>
            </span>
            {unread && (
              <span
                aria-hidden="true"
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
