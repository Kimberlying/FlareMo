import { Link } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { Task } from "@/api";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
  buildMonthGrid,
  formatMonthTitle,
  type WeekStart,
  weekdayLabels,
} from "@/lib/calendar-date";
import { cn } from "@/lib/utils";

export type CalendarDateCell = {
  notes: number;
  note_tasks: number;
  tasks: Task[];
};

export type FlareMoCalendarProps = {
  monthKey: string;
  today: string;
  selected?: string;
  // key -> notes count / due tasks; only optional for the mini calendar.
  data: Map<string, CalendarDateCell>;
  onMonthChange: (direction: 1 | -1) => void;
  onDayClick?: (dayKey: string, cell?: CalendarDateCell) => void;
  // Drop target for drag-to-reschedule of a scheduled task.
  onTaskDrop?: (dayKey: string) => void;
  // Renders task titles inside day cells (full calendar only).
  showTaskTitles?: boolean;
  hideHeader?: boolean;
  className?: string;
};

// One grid, two form factors: the calendar page renders this interactive so
// dates are schedule entries; the explorer mini calendar reuses the same
// primitives in a read-only compact variant.
export const FlareMoCalendar = memo(function FlareMoCalendar({
  data,
  monthKey,
  onDayClick,
  onMonthChange,
  onTaskDrop,
  selected,
  showTaskTitles = false,
  hideHeader = false,
  today,
  className,
}: FlareMoCalendarProps) {
  const { locale, t } = useI18n();
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const weekStart: WeekStart = locale.startsWith("en") ? "sunday" : "monday";
  const grid = useMemo(
    () => buildMonthGrid(monthKey, weekStart),
    [monthKey, weekStart],
  );

  const weekdays = useMemo(
    () =>
      weekdayLabels(weekStart, (day) =>
        new Date(2026, 8, day).toLocaleDateString(locale, {
          weekday: "short",
        }),
      ),
    [weekStart, locale],
  );

  const monthTitle = useMemo(
    () => formatMonthTitle(monthKey, locale),
    [locale, monthKey],
  );

  return (
    <div className={cn("flex flex-col", className)}>
      {!hideHeader && (
        <header className="flex items-center gap-2 mb-3">
          <div className="font-heading min-w-0 flex-1 truncate text-base font-semibold">
            {monthTitle}
          </div>
          <Button
            aria-label={t("calendar.prevMonth")}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => onMonthChange(-1)}
          >
            <ChevronLeftIcon className="rtl:-rotate-180" />
          </Button>
          <Button
            aria-label={t("calendar.nextMonth")}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => onMonthChange(1)}
          >
            <ChevronRightIcon className="rtl:-rotate-180" />
          </Button>
        </header>
      )}
      <div className="grid grid-cols-7 border-b border-border/60 pb-2 text-xs font-medium text-muted-foreground">
        {weekdays.map((label) => (
          <span aria-hidden="true" key={label} className="px-1 text-center">
            {label}
          </span>
        ))}
      </div>
      <div
        className="grid grid-cols-7 gap-1 pt-2 sm:gap-1.5"
        data-testid="calendar-grid"
      >
        {grid.map((day) => {
          const cell = data.get(day.key);
          const isToday = day.key === today;
          const isSelected = selected === day.key;
          const taskCount = cell?.tasks.length ?? 0;
          const noteCount = cell?.notes ?? 0;
          const overdueCount =
            cell?.tasks.filter(
              (task) =>
                task.status !== "done" &&
                task.due_at !== null &&
                task.due_at < today,
            ).length ?? 0;
          const allTasksDone =
            taskCount > 0 &&
            cell?.tasks.every((task) => task.status === "done");

          return (
            <button
              aria-current={isToday ? "date" : undefined}
              aria-label={t("calendar.day", { date: day.key })}
              data-testid={`calendar-day-${day.key}`}
              key={day.key}
              type="button"
              onClick={() => {
                setDragOverKey(null);
                onDayClick?.(day.key, cell);
              }}
              onDragOver={(event) => {
                if (!onTaskDrop) return;
                event.preventDefault();
                setDragOverKey(day.key);
              }}
              onDragLeave={() => {
                if (dragOverKey === day.key) setDragOverKey(null);
              }}
              onDrop={(event) => {
                if (!onTaskDrop) return;
                event.preventDefault();
                setDragOverKey(null);
                onTaskDrop(day.key);
              }}
              className={cn(
                "group relative flex min-h-[64px] flex-col items-start justify-between rounded-lg border p-1 text-xs motion-safe:transition-all motion-safe:duration-150 sm:min-h-[82px] sm:p-1.5",
                day.inMonth
                  ? "border-border/50 bg-card text-foreground"
                  : "border-transparent bg-muted/20 text-muted-foreground/40",
                isSelected
                  ? "ring-2 ring-primary border-primary/40 bg-accent/30 shadow-xs z-10"
                  : "hover:bg-muted/50 hover:border-border/80",
                isToday && !isSelected && "border-brand-500/50 bg-brand-500/5",
                onTaskDrop &&
                  dragOverKey === day.key &&
                  "ring-2 ring-brand-500 bg-brand-500/15 scale-[1.02] shadow-sm z-20",
              )}
            >
              {/* Top row: Date number and indicators */}
              <div className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs tabular-nums font-medium transition-colors",
                    isToday &&
                      "bg-brand-500 font-semibold text-[color:var(--brand-gradient-foreground)] shadow-xs",
                    isSelected && !isToday && "font-bold text-foreground",
                  )}
                >
                  {day.key.slice(-2)}
                </span>

                {/* Note count badge */}
                {noteCount > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-400"
                    title={t("calendar.notesCount", { count: noteCount })}
                  >
                    <span className="text-[10px]">📝</span>
                    <span className="tabular-nums">{noteCount}</span>
                  </span>
                )}
              </div>

              {/* Bottom content: Task titles or Task summary chips */}
              <div className="mt-1 flex w-full flex-col gap-1 overflow-hidden">
                {showTaskTitles && taskCount > 0 ? (
                  <>
                    {cell?.tasks.slice(0, 2).map((task) => {
                      const done = task.status === "done";
                      const overdue =
                        !done && task.due_at !== null && task.due_at < today;
                      return (
                        <span
                          className={cn(
                            "w-full truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight transition-colors",
                            done
                              ? "bg-muted/60 text-muted-foreground line-through"
                              : overdue
                                ? "bg-destructive/10 text-destructive font-medium"
                                : "bg-muted text-foreground",
                          )}
                          key={task.id}
                        >
                          {task.title}
                        </span>
                      );
                    })}
                    {taskCount > 2 && (
                      <span className="text-left text-[10px] tabular-nums text-muted-foreground">
                        +{taskCount - 2}
                      </span>
                    )}
                  </>
                ) : taskCount > 0 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {overdueCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1 py-0.5 text-[10px] font-medium text-destructive">
                        <span>⚠️</span>
                        <span className="tabular-nums">{overdueCount}</span>
                      </span>
                    ) : allTasksDone ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        <span>✓</span>
                        <span className="tabular-nums">{taskCount}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <span className="tabular-nums">
                          {t("calendar.dayTasks", { count: taskCount })}
                        </span>
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export type FlareMoMiniCalendarProps = {
  monthKey: string;
  today: string;
  activeDay?: string;
  onDayClick: (dayKey: string) => void;
  notes: Map<string, number>;
  tasks: Map<string, number>;
  className?: string;
};

// Read-only companion for the explorer sidebar. Shares the grid primitives
// with the full calendar; deliberately non-interactive beyond picking a day.
export const FlareMoMiniCalendar = memo(function FlareMoMiniCalendar({
  activeDay,
  className,
  monthKey,
  notes,
  onDayClick,
  tasks,
  today,
}: FlareMoMiniCalendarProps) {
  const { locale, t } = useI18n();
  const weekStart: WeekStart = locale.startsWith("en") ? "sunday" : "monday";
  const grid = useMemo(
    () => buildMonthGrid(monthKey, weekStart),
    [monthKey, weekStart],
  );
  const weekdays = useMemo(
    () =>
      weekdayLabels(weekStart, (day) =>
        new Date(2026, 8, day).toLocaleDateString(locale, {
          weekday: "narrow",
        }),
      ),
    [weekStart, locale],
  );
  const monthTitle = useMemo(
    () => formatMonthTitle(monthKey, locale),
    [locale, monthKey],
  );

  return (
    <div className={cn("text-xs", className)} data-testid="mini-calendar">
      <div className="mb-1.5 flex items-center justify-between px-0.5 font-medium">
        <Link
          to="/calendar"
          search={{ date: undefined }}
          className="hover:text-primary transition-colors cursor-pointer"
        >
          <span>{monthTitle}</span>
        </Link>
        <Button
          aria-label={t("calendar.today")}
          size="xs"
          type="button"
          variant="ghost"
          onClick={() => onDayClick(today)}
        >
          {t("calendar.today")}
        </Button>
      </div>
      <div className="grid grid-cols-7 text-muted-foreground">
        {weekdays.map((label) => (
          <span aria-hidden="true" key={label} className="text-center">
            {label}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5">
        {grid.map((day) => {
          const noteCount = notes.get(day.key) ?? 0;
          const taskCount = tasks.get(day.key) ?? 0;
          const heatStrength =
            noteCount + taskCount <= 0
              ? undefined
              : noteCount + taskCount <= 1
                ? "bg-primary/30"
                : "bg-primary/60";
          const hasSchedule = taskCount > 0;
          return (
            <button
              aria-label={t("calendar.day", { date: day.key })}
              key={`d-${day.key}`}
              type="button"
              onClick={() => onDayClick(day.key)}
              className={cn(
                "flex h-7 w-full items-center justify-center rounded-[3px] motion-safe:transition-colors motion-safe:duration-150",
                day.inMonth ? "" : "opacity-30",
                activeDay === day.key ? "bg-accent" : "hover:bg-muted",
                hasSchedule &&
                  activeDay !== day.key &&
                  (day.key < today
                    ? "ring-2 ring-destructive/60 dark:ring-destructive/50"
                    : "ring-2 ring-brand-500/70 dark:ring-brand-400/60"),
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full tabular-nums",
                  today === day.key &&
                    "bg-brand-500 font-semibold text-[color:var(--brand-gradient-foreground)]",
                  heatStrength,
                )}
              >
                {day.key.slice(-2)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
