"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  return next;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isWithinRange(day: Date, start: Date | null, end: Date | null) {
  if (!start || !end) return false;
  const t = day.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function buildMonthMatrix(month: Date): Date[] {
  const first = startOfMonth(month);
  const startWeekday = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startWeekday);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

interface MonthGridProps {
  month: Date;
  start: Date | null;
  end: Date | null;
  hover: Date | null;
  onSelect: (date: Date) => void;
  onHover: (date: Date | null) => void;
  onPrev?: () => void;
  onNext?: () => void;
  maxDate?: Date;
}

function MonthGrid({ month, start, end, hover, onSelect, onHover, onPrev, onNext, maxDate }: MonthGridProps) {
  const days = buildMonthMatrix(month);
  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const liveEnd = end ?? (start && hover && hover.getTime() > start.getTime() ? hover : null);
  const liveStart = start && hover && hover.getTime() < start.getTime() ? hover : start;

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        {onPrev ? (
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous month"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : (
          <span className="h-7 w-7" />
        )}
        <span className="text-sm font-semibold text-foreground">{monthLabel}</span>
        {onNext ? (
          <button
            type="button"
            onClick={onNext}
            aria-label="Next month"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <span className="h-7 w-7" />
        )}
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-sm">
        {days.map((day, idx) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isStart = liveStart && sameDay(day, liveStart);
          const isEnd = liveEnd && sameDay(day, liveEnd);
          const inRange = isWithinRange(day, liveStart, liveEnd);
          const isToday = sameDay(day, new Date());
          const disabled = maxDate ? day.getTime() > maxDate.getTime() : false;

          return (
            <button
              key={idx}
              type="button"
              disabled={disabled || !inMonth}
              onMouseEnter={() => inMonth && onHover(day)}
              onMouseLeave={() => onHover(null)}
              onClick={() => !disabled && inMonth && onSelect(day)}
              className={cn(
                "relative h-9 text-center transition-colors",
                "disabled:cursor-default",
                !inMonth && "invisible",
                inRange && !isStart && !isEnd && "bg-accent/60",
                (isStart || isEnd) && "z-10",
                isStart && liveEnd && !sameDay(liveStart!, liveEnd) && "rounded-s-full",
                isEnd && liveStart && !sameDay(liveStart, liveEnd) && "rounded-e-full"
              )}
            >
              <span
                className={cn(
                  "mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                  inMonth && !disabled && !isStart && !isEnd && "hover:bg-muted",
                  (isStart || isEnd) && "bg-foreground text-background font-semibold",
                  isToday && !isStart && !isEnd && "ring-1 ring-foreground/30",
                  disabled && "text-muted-foreground/40"
                )}
              >
                {day.getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface DualCalendarProps {
  start: Date | null;
  end: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
  initialMonth?: Date;
  maxDate?: Date;
}

export function DualCalendar({ start, end, onChange, initialMonth, maxDate }: DualCalendarProps) {
  const [leftMonth, setLeftMonth] = useState(() => startOfMonth(initialMonth ?? start ?? new Date()));
  const [hover, setHover] = useState<Date | null>(null);
  const rightMonth = addMonths(leftMonth, 1);

  useEffect(() => {
    if (start) {
      const startMonth = startOfMonth(start);
      // Only shift if start is outside the visible 2-month window
      if (
        startMonth.getTime() < leftMonth.getTime() ||
        startMonth.getTime() > rightMonth.getTime()
      ) {
        setLeftMonth(startMonth);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.getTime()]);

  function handleSelect(day: Date) {
    if (!start || (start && end)) {
      onChange(day, null);
      return;
    }
    if (day.getTime() < start.getTime()) {
      onChange(day, start);
      return;
    }
    onChange(start, day);
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
      <MonthGrid
        month={leftMonth}
        start={start}
        end={end}
        hover={hover}
        onSelect={handleSelect}
        onHover={setHover}
        onPrev={() => setLeftMonth(addMonths(leftMonth, -1))}
        maxDate={maxDate}
      />
      <MonthGrid
        month={rightMonth}
        start={start}
        end={end}
        hover={hover}
        onSelect={handleSelect}
        onHover={setHover}
        onNext={() => setLeftMonth(addMonths(leftMonth, 1))}
        maxDate={maxDate}
      />
    </div>
  );
}
