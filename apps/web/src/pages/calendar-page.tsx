import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GripVerticalIcon,
  ListTodoIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createMemo,
  createTask,
  deleteTask,
  getCalendarView,
  listMemos,
  listTasks,
  type Task,
  updateTask,
} from "@/api";
import { AttachmentGallery } from "@/components/attachment-gallery";
import type { CalendarDateCell } from "@/components/flaremo-calendar";
import { FlareMoCalendar } from "@/components/flaremo-calendar";
import { LazyMemoContent } from "@/components/lazy-memo-content";
import { QueryErrorState } from "@/components/query-error-state";
import { SubpageHeader } from "@/components/subpage-header";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import {
  addMonths,
  buildMonthGrid,
  dayFilterQuery,
  formatDayTitle,
  formatMonthTitle,
  monthOf,
  nextDay,
  prevDay,
  todayKey,
  type WeekStart,
} from "@/lib/calendar-date";
import { errorMessage } from "@/lib/error";
import { formatMemoTime } from "@/lib/memo";
import { cn, stripResourceName } from "@/lib/utils";

function addDays(fromKey: string, days: number): string {
  const date = new Date(`${fromKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatFullDayHeader(dayKey: string, locale: string): string {
  const date = new Date(`${dayKey}T12:00:00`);
  if (locale.startsWith("zh")) {
    const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 星期${weekday}`;
  }
  return date.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function CalendarPage({ initialDate }: { initialDate?: string }) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const today = useMemo(() => todayKey(), []);
  const [cursor, setCursor] = useState(() => initialDate ?? today);
  const [selected, setSelected] = useState(() => initialDate ?? today);
  const [dragTask, setDragTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "agenda">("month");

  const weekStart: WeekStart = locale.startsWith("en") ? "sunday" : "monday";
  const monthKey = monthOf(cursor);
  const grid = useMemo(
    () => buildMonthGrid(monthKey, weekStart),
    [monthKey, weekStart],
  );
  const gridStart = grid[0].key;
  const gridEnd = grid[grid.length - 1].key;

  const timeZoneOffset = useMemo(() => new Date().getTimezoneOffset(), []);

  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: ["tasks"],
      queryFn: () => listTasks(),
    });
  }, [queryClient]);

  const calendarQuery = useQuery({
    queryKey: ["calendar", gridStart, gridEnd, timeZoneOffset],
    queryFn: () =>
      getCalendarView({ from: gridStart, to: gridEnd, tz: timeZoneOffset }),
  });

  const data = useMemo(() => {
    const map = new Map<string, CalendarDateCell>();
    const ensure = (key: string) => {
      let cell = map.get(key);
      if (!cell) {
        cell = { notes: 0, note_tasks: 0, tasks: [] };
        map.set(key, cell);
      }
      return cell;
    };
    for (const note of calendarQuery.data?.notes ?? []) {
      ensure(note.date).notes = note.count;
    }
    for (const noteTask of calendarQuery.data?.note_tasks ?? []) {
      ensure(noteTask.date).note_tasks = noteTask.count;
    }
    for (const task of calendarQuery.data?.tasks ?? []) {
      if (!task.due_at) continue;
      ensure(task.due_at).tasks.push(task);
    }
    return map;
  }, [calendarQuery.data]);

  const selectedCell = data.get(selected);
  const selectedTasks = selectedCell?.tasks ?? [];

  const monthStats = useMemo(() => {
    const monthPrefix = `${monthKey}-`;
    let notes = 0;
    let tasks = 0;
    for (const [key, cell] of data.entries()) {
      if (key.startsWith(monthPrefix)) {
        notes += cell.notes;
        tasks += cell.tasks.length;
      }
    }
    return { notes, tasks };
  }, [data, monthKey]);

  function invalidateCalendar() {
    void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  return (
    <div className="min-h-svh bg-background px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <SubpageHeader
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {/* Month navigation stepper */}
              <div className="flex items-center rounded-lg border border-border/60 bg-card p-0.5 shadow-2xs">
                <Button
                  aria-label={t("calendar.prevMonth")}
                  className="size-7"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const next = addMonths(-1, `${monthKey}-01`);
                    setCursor(next);
                  }}
                >
                  <ChevronLeftIcon className="size-3.5 rtl:-rotate-180" />
                </Button>
                <span className="px-2 text-xs font-semibold tabular-nums text-foreground">
                  {formatMonthTitle(monthKey, locale)}
                </span>
                <Button
                  aria-label={t("calendar.nextMonth")}
                  className="size-7"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const next = addMonths(1, `${monthKey}-01`);
                    setCursor(next);
                  }}
                >
                  <ChevronRightIcon className="size-3.5 rtl:-rotate-180" />
                </Button>
              </div>

              {/* Back to Today */}
              <Button
                className="h-8 text-xs font-medium"
                size="sm"
                variant={selected === today ? "secondary" : "outline"}
                type="button"
                onClick={() => {
                  setCursor(today);
                  setSelected(today);
                }}
              >
                {t("calendar.today")}
              </Button>

              {/* View Switcher */}
              <div
                aria-label={t("calendar.viewLabel")}
                className="flex rounded-lg border border-border/60 bg-card p-0.5 shadow-2xs"
                role="tablist"
              >
                {(
                  [
                    ["month", t("calendar.viewMonth")],
                    ["agenda", t("calendar.viewAgenda")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    aria-selected={viewMode === value}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium motion-safe:transition-all motion-safe:duration-150",
                      viewMode === value
                        ? "bg-accent font-semibold text-accent-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    key={value}
                    role="tab"
                    type="button"
                    onClick={() => setViewMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          }
          subtitle={
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {t("calendar.monthStats", {
                notes: monthStats.notes,
                tasks: monthStats.tasks,
              })}
            </span>
          }
          title={t("calendar.title")}
        />

        {viewMode === "agenda" ? (
          <AgendaView
            calendarNotes={calendarQuery.data?.notes ?? []}
            today={today}
            onDaySelect={(dayKey) => {
              setSelected(dayKey);
              setCursor(dayKey);
              setViewMode("month");
            }}
          />
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* Left: Main Month Calendar Card */}
            <div className="min-w-0 flex-1">
              <Card className="overflow-hidden border-border/60 bg-card shadow-xs">
                <CardContent className="p-4 sm:p-5">
                  {calendarQuery.isLoading ? (
                    <Skeleton className="h-[460px] w-full rounded-xl" />
                  ) : calendarQuery.isError && !calendarQuery.data ? (
                    <QueryErrorState
                      isRetrying={calendarQuery.isRefetching}
                      onRetry={() => void calendarQuery.refetch()}
                    />
                  ) : (
                    <FlareMoCalendar
                      data={data}
                      hideHeader
                      monthKey={monthKey}
                      selected={selected}
                      showTaskTitles
                      today={today}
                      onDayClick={(dayKey) => {
                        setSelected(dayKey);
                        setCursor(dayKey);
                      }}
                      onMonthChange={(direction) => {
                        const next = addMonths(direction, `${monthKey}-01`);
                        setCursor(next);
                      }}
                      onTaskDrop={(dayKey) => {
                        const task = dragTask;
                        setDragTask(null);
                        if (!task || task.due_at === dayKey) return;
                        void updateTask(stripResourceName(task.id, "tasks"), {
                          due_at: dayKey,
                        })
                          .then(() => {
                            invalidateCalendar();
                            if (dayKey < today) {
                              toast.warning(
                                t("calendar.toastRescheduledPast", {
                                  date: dayKey,
                                }),
                              );
                            } else {
                              toast.success(t("calendar.toastRescheduled"));
                            }
                          })
                          .catch((error) =>
                            toast.error(
                              errorMessage(error, t("calendar.actionFailed")),
                            ),
                          );
                      }}
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Day Inspector Panel */}
            <div className="w-full shrink-0 lg:w-[410px] xl:w-[440px]">
              <div className="lg:sticky lg:top-6">
                <DayInspector
                  day={selected}
                  noteTasks={selectedCell?.note_tasks ?? 0}
                  notesCount={selectedCell?.notes ?? 0}
                  tasks={selectedTasks}
                  today={today}
                  onNextDay={() => {
                    const next = nextDay(selected);
                    setSelected(next);
                    if (monthOf(next) !== monthKey) setCursor(next);
                  }}
                  onPrevDay={() => {
                    const prev = prevDay(selected);
                    setSelected(prev);
                    if (monthOf(prev) !== monthKey) setCursor(prev);
                  }}
                  onTaskDragStart={setDragTask}
                  onTaskSaved={invalidateCalendar}
                  onToday={() => {
                    setSelected(today);
                    setCursor(today);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function DayInspector({
  day,
  today,
  tasks,
  noteTasks,
  notesCount,
  onTaskDragStart,
  onTaskSaved,
  onPrevDay,
  onNextDay,
  onToday,
}: {
  day: string;
  today: string;
  tasks: Task[];
  noteTasks: number;
  notesCount: number;
  onTaskDragStart: (task: Task | null) => void;
  onTaskSaved: () => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
}) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "notes" | "tasks">("all");

  // Fetch actual memos created on this day
  const dayFilter = useMemo(() => dayFilterQuery(day), [day]);
  const dayMemosQuery = useQuery({
    queryKey: ["memos", "day", day],
    queryFn: ({ signal }) => listMemos({ q: dayFilter, page_size: 50 }, signal),
    staleTime: 30_000,
  });

  const memos = dayMemosQuery.data?.memos ?? [];

  // Quick note creation for today
  const [quickNoteContent, setQuickNoteContent] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);
  const [showNoteComposer, setShowNoteComposer] = useState(false);

  // Quick add task
  const [taskTitle, setTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  // Task delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  // Custom reschedule date state
  const [customDate, setCustomDate] = useState(day);
  useEffect(() => {
    setCustomDate(day);
  }, [day]);

  const isToday = day === today;

  const toggleDone = async (task: Task) => {
    try {
      await updateTask(stripResourceName(task.id, "tasks"), {
        status: task.status === "done" ? "todo" : "done",
      });
      onTaskSaved();
    } catch (error) {
      toast.error(errorMessage(error, t("calendar.actionFailed")));
    }
  };

  const rescheduleTask = async (task: Task, newDate: string | null) => {
    try {
      await updateTask(stripResourceName(task.id, "tasks"), {
        due_at: newDate,
      });
      onTaskSaved();
      if (newDate && newDate < today) {
        toast.warning(t("calendar.toastRescheduledPast", { date: newDate }));
      } else {
        toast.success(t("calendar.toastRescheduled"));
      }
    } catch (error) {
      toast.error(errorMessage(error, t("calendar.actionFailed")));
    }
  };

  const removeTask = async (task: Task) => {
    setDeleteTarget(null);
    try {
      await deleteTask(stripResourceName(task.id, "tasks"));
      onTaskSaved();
      toast.success(t("calendar.toastDeleted"));
    } catch (error) {
      toast.error(errorMessage(error, t("calendar.actionFailed")));
    }
  };

  const submitTask = async () => {
    const value = taskTitle.trim();
    if (!value) return;
    setCreatingTask(true);
    try {
      await createTask({
        title: value,
        due_at: day,
      });
      setTaskTitle("");
      onTaskSaved();
      toast.success(t("calendar.toastCreated"));
    } catch (error) {
      toast.error(errorMessage(error, t("calendar.actionFailed")));
    } finally {
      setCreatingTask(false);
    }
  };

  const submitQuickNote = async () => {
    const value = quickNoteContent.trim();
    if (!value) return;
    setCreatingNote(true);
    try {
      await createMemo({
        content: value,
        visibility: "private",
        source: "web",
      });
      setQuickNoteContent("");
      setShowNoteComposer(false);
      toast.success(t("calendar.noteCreated"));
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    } catch (error) {
      toast.error(errorMessage(error, t("calendar.actionFailed")));
    } finally {
      setCreatingNote(false);
    }
  };

  return (
    <Card className="border-border/60 bg-card shadow-xs">
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
        {/* Day Header */}
        <div className="flex flex-col gap-2 pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                aria-label={t("calendar.prevDay")}
                className="size-7"
                size="icon-xs"
                type="button"
                variant="ghost"
                onClick={onPrevDay}
              >
                <ChevronLeftIcon className="size-3.5 rtl:-rotate-180" />
              </Button>
              <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">
                {formatDayTitle(day, locale)}
              </h2>
              {isToday ? (
                <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--brand-gradient-foreground)] shadow-2xs">
                  {t("calendar.todayTitle")}
                </span>
              ) : (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted underline-offset-2"
                  type="button"
                  onClick={onToday}
                >
                  {t("calendar.today")}
                </button>
              )}
              <Button
                aria-label={t("calendar.nextDay")}
                className="size-7"
                size="icon-xs"
                type="button"
                variant="ghost"
                onClick={onNextDay}
              >
                <ChevronRightIcon className="size-3.5 rtl:-rotate-180" />
              </Button>
            </div>

            {/* Quick Note Trigger */}
            <Button
              className="h-7 gap-1 px-2.5 text-xs font-medium"
              size="xs"
              type="button"
              variant="outline"
              onClick={() => setShowNoteComposer((v) => !v)}
            >
              <PlusIcon className="size-3" />
              {t("calendar.createNote")}
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="text-[11px]">
              {formatFullDayHeader(day, locale)}
            </span>
            <span className="tabular-nums">
              {t("calendar.notesCount", { count: memos.length || notesCount })}{" "}
              · {t("calendar.dayTasks", { count: tasks.length })}
            </span>
          </div>

          {/* Quick Note Composer (inline) */}
          {showNoteComposer && (
            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/30 p-3 motion-safe:animate-rise">
              <textarea
                className="w-full resize-none rounded-md border border-border/60 bg-background p-2 text-xs leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-brand-500"
                disabled={creatingNote}
                placeholder={t("calendar.quickNotePlaceholder")}
                rows={3}
                value={quickNoteContent}
                onChange={(e) => setQuickNoteContent(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void submitQuickNote();
                  }
                }}
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="xs"
                  type="button"
                  variant="ghost"
                  onClick={() => setShowNoteComposer(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  disabled={creatingNote || !quickNoteContent.trim()}
                  size="xs"
                  type="button"
                  onClick={() => void submitQuickNote()}
                >
                  <SendIcon className="size-3" />
                  {t("calendar.createNote")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Filter Tabs */}
        <div
          aria-label={t("calendar.filterAll")}
          className="flex rounded-lg border border-border/60 bg-muted/40 p-0.5 text-xs"
          role="tablist"
        >
          {(
            [
              [
                "all",
                t("calendar.filterAll"),
                (memos.length || notesCount) + tasks.length,
              ],
              ["notes", t("calendar.filterNotes"), memos.length || notesCount],
              ["tasks", t("calendar.filterTasks"), tasks.length],
            ] as const
          ).map(([val, label, count]) => (
            <button
              aria-selected={filter === val}
              className={cn(
                "flex-1 rounded-md py-1 text-center text-xs font-medium motion-safe:transition-all motion-safe:duration-150",
                filter === val
                  ? "bg-card font-semibold text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
              key={val}
              role="tab"
              type="button"
              onClick={() => setFilter(val)}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {/* Content Stream */}
        <div className="flex flex-col gap-4 max-h-[580px] overflow-y-auto pr-1">
          {/* Section: Notes / Records */}
          {(filter === "all" || filter === "notes") && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FileTextIcon className="size-3.5 text-brand-500" />
                  {t("calendar.filterNotes")} ({memos.length})
                </span>
                {memos.length > 0 && (
                  <Link
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    search={{
                      q: dayFilter,
                      compose: undefined,
                      space: undefined,
                      tag: undefined,
                      untagged: undefined,
                      view: undefined,
                    }}
                    to="/"
                  >
                    <span>{t("calendar.viewDayNotes")}</span>
                    <ArrowRightIcon className="size-3 rtl:-rotate-180" />
                  </Link>
                )}
              </div>

              {dayMemosQuery.isLoading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              ) : memos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 p-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    {t("calendar.noNotes")}
                  </p>
                  <Button
                    className="mt-2 text-xs"
                    size="xs"
                    type="button"
                    variant="outline"
                    onClick={() => setShowNoteComposer(true)}
                  >
                    <PlusIcon className="size-3" />
                    {t("calendar.createNote")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {memos.map((memo) => {
                    const rawId = stripResourceName(memo.name, "memos");
                    return (
                      <div
                        className="group flex flex-col gap-1.5 rounded-xl border border-border/60 bg-muted/20 p-3 shadow-2xs hover:bg-muted/40 transition-colors"
                        key={memo.name}
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-mono text-[11px]">
                            <ClockIcon className="size-3 opacity-60" />
                            {formatMemoTime(memo.create_time, locale)}
                          </span>
                          <Link
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-opacity"
                            params={{ memoId: rawId }}
                            to="/memo/$memoId"
                          >
                            <ExternalLinkIcon className="size-3" />
                          </Link>
                        </div>

                        <div className="text-xs leading-relaxed text-foreground">
                          <LazyMemoContent
                            className="text-xs leading-relaxed line-clamp-6"
                            content={memo.content}
                          />
                        </div>

                        {/* Attachments preview */}
                        {memo.attachments && memo.attachments.length > 0 && (
                          <div className="mt-1">
                            <AttachmentGallery attachments={memo.attachments} />
                          </div>
                        )}

                        {/* Tags */}
                        {memo.payload?.tags && memo.payload.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {memo.payload.tags.map((tag) => (
                              <Badge
                                className="text-[10px] px-1.5 py-0 font-normal"
                                key={tag}
                                variant="secondary"
                              >
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section: Tasks */}
          {(filter === "all" || filter === "tasks") && (
            <div className="flex flex-col gap-2 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ListTodoIcon className="size-3.5 text-primary" />
                  {t("calendar.filterTasks")} ({tasks.length})
                </span>
                {noteTasks > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {t("calendar.dayNoteTasks", { count: noteTasks })}
                  </span>
                )}
              </div>

              {tasks.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  {t("calendar.dueEmpty")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {tasks.map((task) => {
                    const done = task.status === "done";
                    const overdue =
                      !done && task.due_at !== null && task.due_at < today;
                    return (
                      <li
                        className={cn(
                          "group flex items-center gap-2 rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/60",
                          overdue && "border-destructive/30 bg-destructive/5",
                        )}
                        draggable={!done}
                        key={task.id}
                        onDragEnd={() => onTaskDragStart(null)}
                        onDragStart={() => onTaskDragStart(task)}
                        title={t("calendar.dragHint")}
                      >
                        <GripVerticalIcon
                          aria-hidden="true"
                          className={cn(
                            "size-3.5 shrink-0 text-muted-foreground/40",
                            !done &&
                              "cursor-grab group-hover:text-muted-foreground",
                          )}
                        />
                        <button
                          aria-label={
                            done
                              ? t("projects.status.todo")
                              : t("projects.status.done")
                          }
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                          type="button"
                          onClick={() => void toggleDone(task)}
                        >
                          {done ? (
                            <CheckCircle2Icon className="size-4 text-primary" />
                          ) : (
                            <CircleIcon
                              className={cn(
                                "size-4",
                                overdue && "text-destructive",
                              )}
                            />
                          )}
                        </button>
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate font-medium",
                            done &&
                              "text-muted-foreground line-through font-normal",
                          )}
                        >
                          {task.title}
                        </span>
                        {overdue && (
                          <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                            {t("calendar.overdue")}
                          </span>
                        )}

                        {/* Reschedule Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            type="button"
                          >
                            {t("calendar.reschedule")}
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-44 text-xs"
                          >
                            <DropdownMenuItem
                              onClick={() => void rescheduleTask(task, today)}
                            >
                              {t("calendar.rescheduleToday")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                void rescheduleTask(task, nextDay(today))
                              }
                            >
                              {t("calendar.rescheduleTomorrow")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                void rescheduleTask(task, addDays(today, 7))
                              }
                            >
                              {t("calendar.rescheduleNextWeek")}
                            </DropdownMenuItem>
                            <div className="border-t border-border/60 p-1.5">
                              <span className="text-[10px] font-medium text-muted-foreground block mb-1">
                                {t("calendar.reschedulePickDate")}
                              </span>
                              <div className="flex items-center gap-1">
                                <Input
                                  aria-label={t("calendar.reschedulePickDate")}
                                  className="h-6 text-[11px] px-1"
                                  type="date"
                                  value={customDate}
                                  onChange={(e) =>
                                    setCustomDate(e.target.value)
                                  }
                                />
                                <Button
                                  size="xs"
                                  type="button"
                                  onClick={() =>
                                    void rescheduleTask(
                                      task,
                                      customDate || null,
                                    )
                                  }
                                >
                                  {t("common.save")}
                                </Button>
                              </div>
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Delete Task */}
                        <button
                          aria-label={t("calendar.deleteTask")}
                          className="rounded p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          type="button"
                          onClick={() => setDeleteTarget(task)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Quick Add Task Input */}
              <form
                className="mt-1 flex items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitTask();
                }}
              >
                <Input
                  aria-label={t("calendar.quickAdd")}
                  className="h-8 text-xs bg-background"
                  disabled={creatingTask}
                  placeholder={t("calendar.quickAddPlaceholder")}
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                />
                <Button
                  disabled={creatingTask || !taskTitle.trim()}
                  size="sm"
                  type="submit"
                >
                  <PlusIcon className="size-3.5" />
                  {t("calendar.quickAdd")}
                </Button>
              </form>
            </div>
          )}
        </div>

        {/* Delete Task AlertDialog */}
        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("calendar.deleteTask")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("calendar.deleteTaskConfirm", {
                  title: deleteTarget?.title ?? "",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="ghost">
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  if (deleteTarget) void removeTask(deleteTarget);
                }}
              >
                {t("calendar.deleteTask")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function AgendaView({
  today,
  calendarNotes,
  onDaySelect,
}: {
  today: string;
  calendarNotes: Array<{ date: string; count: number }>;
  onDaySelect: (dayKey: string) => void;
}) {
  const { locale, t } = useI18n();
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);
  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
  });

  // Map notes per date
  const notesByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of calendarNotes) {
      map.set(item.date, item.count);
    }
    return map;
  }, [calendarNotes]);

  // Aggregate all active dates from tasks and notes
  const groups = useMemo(() => {
    const tasksByDay = new Map<string, Task[]>();
    for (const task of tasksQuery.data?.tasks ?? []) {
      if (!task.due_at || task.status === "done") continue;
      const list = tasksByDay.get(task.due_at) ?? [];
      list.push(task);
      tasksByDay.set(task.due_at, list);
    }

    const allDates = new Set<string>([
      ...tasksByDay.keys(),
      ...notesByDay.keys(),
    ]);

    const keys = [...allDates].sort();
    const overdue = keys.filter((key) => key < today);
    const upcoming = keys.filter((key) => key >= today);

    return [...overdue, ...upcoming].map((key) => ({
      key,
      overdue: key < today,
      tasks: tasksByDay.get(key) ?? [],
      notesCount: notesByDay.get(key) ?? 0,
    }));
  }, [tasksQuery.data, notesByDay, today]);

  const unscheduled = useMemo(
    () =>
      (tasksQuery.data?.tasks ?? []).filter(
        (task) => !task.due_at && task.status !== "done",
      ),
    [tasksQuery.data],
  );

  return (
    <Card className="border-border/60 bg-card shadow-xs">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <h2 className="font-heading text-base font-semibold text-foreground">
            {t("calendar.agendaTitle")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {groups.length} {t("calendar.viewMonth")}
          </span>
        </div>

        {tasksQuery.isError && !tasksQuery.data ? (
          <QueryErrorState
            className="text-muted-foreground py-8"
            isRetrying={tasksQuery.isRefetching}
            onRetry={() => void tasksQuery.refetch()}
          />
        ) : (
          <div className="mt-4 flex flex-col divide-y divide-border/60">
            {groups.length === 0 &&
              unscheduled.length === 0 &&
              !tasksQuery.isLoading && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {t("calendar.agendaEmpty")}
                </div>
              )}

            {/* Unscheduled Tasks Section */}
            {unscheduled.length > 0 && (
              <div className="py-3">
                <button
                  aria-expanded={unscheduledOpen}
                  className="flex w-full items-center gap-2 text-left"
                  type="button"
                  onClick={() => setUnscheduledOpen((value) => !value)}
                >
                  <ChevronDownIcon
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150",
                      !unscheduledOpen && "-rotate-90 rtl:rotate-90",
                    )}
                  />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("calendar.agendaUnscheduled")}
                  </span>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {t("calendar.dayTasks", { count: unscheduled.length })}
                  </span>
                </button>
                {unscheduledOpen && (
                  <div className="mt-2 flex flex-col gap-1 pl-6">
                    {unscheduled.map((task) => (
                      <div
                        className="flex items-center justify-between rounded-md p-1.5 text-xs text-muted-foreground hover:bg-muted/40"
                        key={task.id}
                      >
                        <span className="truncate">{task.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Chronological Day Groups */}
            {groups.map((group) => (
              <div className="py-3.5" key={group.key}>
                <div className="flex items-center justify-between gap-3">
                  <button
                    className="flex items-center gap-2 text-left group"
                    type="button"
                    onClick={() => onDaySelect(group.key)}
                  >
                    <span
                      className={cn(
                        "font-heading text-sm font-semibold tabular-nums transition-colors group-hover:text-brand-500",
                        group.overdue ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {group.key === today
                        ? t("calendar.todayTitle")
                        : formatDayTitle(group.key, locale)}
                    </span>
                    <span className="text-xs text-muted-foreground/60">
                      ({formatFullDayHeader(group.key, locale)})
                    </span>
                    {group.overdue && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                        {t("calendar.overdue")}
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    {group.notesCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-400">
                        <span>📝</span>
                        <span className="tabular-nums">
                          {t("calendar.notesCount", {
                            count: group.notesCount,
                          })}
                        </span>
                      </span>
                    )}
                    {group.tasks.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <span className="tabular-nums">
                          {t("calendar.dayTasks", {
                            count: group.tasks.length,
                          })}
                        </span>
                      </span>
                    )}
                    <Button
                      className="size-7"
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                      onClick={() => onDaySelect(group.key)}
                    >
                      <ArrowRightIcon className="size-3.5 rtl:-rotate-180" />
                    </Button>
                  </div>
                </div>

                {/* Task list for this day */}
                {group.tasks.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 pl-4">
                    {group.tasks.map((task) => (
                      <div
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                        key={task.id}
                      >
                        <CircleIcon className="size-3 text-muted-foreground/60 shrink-0" />
                        <span className="truncate">{task.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
