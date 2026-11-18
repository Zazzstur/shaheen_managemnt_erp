"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type PeriodMode = "month" | "range";

type Period = {
  mode: PeriodMode;
  month: string;
  from: string;
  to: string;
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function defaultPeriod(): Period {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    mode: "month",
    month: currentMonth(),
    from: isoDate(start),
    to: isoDate(now),
  };
}

function monthBounds(month: string) {
  const [year, part] = month.split("-").map(Number);
  const last = new Date(year, part, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}

function periodBounds(period: Period) {
  if (period.mode === "month") {
    return monthBounds(period.month);
  }
  if (period.from > period.to) {
    return { from: period.to, to: period.from };
  }
  return { from: period.from, to: period.to };
}

function dayCount(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function RangeCalendar({
  from,
  to,
  start,
  onStart,
  onComplete,
}: {
  from: string;
  to: string;
  start: string | null;
  onStart: (day: string) => void;
  onComplete: (from: string, to: string) => void;
}) {
  const [view, setView] = useState(() => (start ?? from).slice(0, 7));
  const [hover, setHover] = useState<string | null>(null);
  const [year, month] = view.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const count = new Date(year, month, 0).getDate();
  const today = isoDate(new Date());
  const rangeStart = start ?? from;
  const rangeEnd = start ? (hover ?? start) : to;
  const low = rangeStart < rangeEnd ? rangeStart : rangeEnd;
  const high = rangeStart < rangeEnd ? rangeEnd : rangeStart;
  const label = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  function shift(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    setView(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  function pick(day: string) {
    if (!start) {
      onStart(day);
      return;
    }
    onComplete(start <= day ? start : day, start <= day ? day : start);
  }

  return (
    <div className="w-[16.5rem]">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => shift(-1)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-xs font-medium">{label}</span>
        <button
          type="button"
          aria-label="Next month"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => shift(1)}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        {start ? "Select an end date" : "Select a start date"}
      </p>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((day, index) => (
          <span
            key={`${day}-${index}`}
            className="py-1 text-[10px] font-medium text-muted-foreground"
          >
            {day}
          </span>
        ))}
        {Array.from({ length: firstWeekday }, (_, index) => (
          <span key={`pad-${index}`} />
        ))}
        {Array.from({ length: count }, (_, index) => {
          const day = `${view}-${String(index + 1).padStart(2, "0")}`;
          const endpoint = day === low || day === high;
          const inRange = day > low && day < high;
          return (
            <button
              key={day}
              type="button"
              className={cn(
                "mx-auto flex size-8 items-center justify-center rounded-md text-xs",
                endpoint && "bg-foreground text-background",
                inRange && "bg-muted",
                !endpoint && "hover:bg-muted",
                day === today && !endpoint && "ring-1 ring-foreground/25",
              )}
              onMouseEnter={() => setHover(day)}
              onMouseLeave={() => setHover(null)}
              onClick={() => pick(day)}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PeriodControl({
  period,
  onChange,
}: {
  period: Period;
  onChange: (period: Period) => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md bg-muted p-0.5 text-xs">
        {(
          [
            ["month", "Month"],
            ["range", "Dates"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={cn(
              "rounded px-2 py-1 font-medium transition-colors",
              period.mode === mode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              if (mode === period.mode) {
                if (mode === "range") setOpen(true);
                return;
              }
              if (mode === "range") {
                const bounds = monthBounds(period.month);
                onChange({ ...period, mode, ...bounds });
                setStart(null);
                setOpen(true);
                return;
              }
              setOpen(false);
              onChange({ ...period, mode, month: period.from.slice(0, 7) });
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {period.mode === "month" ? (
        <input
          type="month"
          aria-label="Month"
          value={period.month}
          onChange={(event) => {
            if (event.target.value) {
              onChange({ ...period, month: event.target.value });
            }
          }}
          className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none"
        />
      ) : (
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) setStart(null);
          }}
        >
          <PopoverTrigger className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none">
            {start
              ? `${formatRange(start, start)} –`
              : formatRange(period.from, period.to)}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3">
            <RangeCalendar
              from={period.from}
              to={period.to}
              start={start}
              onStart={setStart}
              onComplete={(from, to) => {
                onChange({ ...period, from, to });
                setStart(null);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

type Overview = FunctionReturnType<typeof api.dashboard.overview>;

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatRange(from: string, to: string) {
  const style: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  const start = new Date(`${from}T00:00:00`).toLocaleDateString(undefined, style);
  const end = new Date(`${to}T00:00:00`).toLocaleDateString(undefined, style);
  return from === to ? start : `${start} – ${end}`;
}

type FeeSeriesId = "academic" | "discount" | "transport";

function feeAmount(
  point: {
    academic: number;
    academicDiscount: number;
    transport: number;
  },
  focus: FeeSeriesId | null,
) {
  if (focus === "academic") return point.academic;
  if (focus === "discount") return point.academicDiscount;
  if (focus === "transport") return point.transport;
  return Math.max(point.academic + point.academicDiscount, point.transport);
}

function FeeColumns({
  points,
  focus,
}: {
  points: Array<{
    label: string;
    academic: number;
    academicDiscount: number;
    transport: number;
  }>;
  focus: FeeSeriesId | null;
}) {
  const heights = points.map((point) => feeAmount(point, focus));
  const max = Math.max(1, ...heights);
  if (!heights.some((height) => height > 0)) {
    const empty =
      focus === "academic"
        ? "No academic fees in this range."
        : focus === "discount"
          ? "No academic discount in this range."
          : focus === "transport"
            ? "No transport fees in this range."
            : "No fees collected in this range.";
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  const labelStep = points.length > 16 ? 5 : points.length > 8 ? 2 : 1;

  return (
    <div>
      <div className="flex h-44 items-end gap-1">
        {points.map((point, index) => {
          const academicStack = point.academic + point.academicDiscount;
          const academicHeight =
            academicStack === 0 ? 0 : Math.max(4, (academicStack / max) * 100);
          const transportHeight =
            point.transport === 0 ? 0 : Math.max(4, (point.transport / max) * 100);
          const focusedAmount = focus ? feeAmount(point, focus) : 0;
          const focusedHeight =
            focusedAmount === 0 ? 0 : Math.max(4, (focusedAmount / max) * 100);
          const focusedClass =
            focus === "discount"
              ? "bg-neutral-400"
              : focus === "transport"
                ? "bg-chart-5"
                : "bg-chart-3";
          const title = focus
            ? `${point.label}: ${focus} ${money(focusedAmount)}`
            : `${point.label}: academic ${money(point.academic)}, discount ${money(point.academicDiscount)}, transport ${money(point.transport)}`;
          return (
            <div
              key={`${point.label}-${index}`}
              className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
              title={title}
            >
              {focus ? (
                <div
                  className={cn("w-2/5 rounded-t-sm", focusedClass)}
                  style={{ height: `${focusedHeight}%` }}
                />
              ) : (
                <>
                  <div className="flex h-full w-[42%] min-w-0 flex-col justify-end">
                    <div
                      className="flex w-full flex-col overflow-hidden rounded-t-sm"
                      style={{ height: `${academicHeight}%` }}
                    >
                      {point.academicDiscount > 0 ? (
                        <div
                          className="min-h-0 bg-neutral-400"
                          style={{ flexGrow: point.academicDiscount }}
                        />
                      ) : null}
                      {point.academic > 0 ? (
                        <div
                          className="min-h-0 bg-chart-3"
                          style={{ flexGrow: point.academic }}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex h-full w-[42%] min-w-0 flex-col justify-end">
                    <div
                      className="w-full rounded-t-sm bg-chart-5"
                      style={{ height: `${transportHeight}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1">
        {points.map((point, index) => (
          <div
            key={`${point.label}-label-${index}`}
            className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground"
          >
            {index % labelStep === 0 ? point.label.split("–")[0] : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

type ExpenseSeriesId = "fuel" | "staff" | "stock" | "other";

const EXPENSE_BARS: Array<{
  id: ExpenseSeriesId;
  label: string;
  className: string;
}> = [
  { id: "fuel", label: "fuel", className: "bg-chart-1" },
  { id: "staff", label: "staff payments", className: "bg-chart-4" },
  { id: "stock", label: "stock", className: "bg-chart-3" },
  { id: "other", label: "other expenses", className: "bg-chart-5" },
];

function ExpenseColumns({
  points,
  focus,
}: {
  points: Array<{
    label: string;
    fuel: number;
    staff: number;
    stock: number;
    other: number;
  }>;
  focus: ExpenseSeriesId | null;
}) {
  const bars = focus
    ? EXPENSE_BARS.filter((item) => item.id === focus)
    : EXPENSE_BARS;
  const heights = points.map((point) =>
    focus
      ? point[focus]
      : Math.max(point.fuel, point.staff, point.stock, point.other),
  );
  const max = Math.max(1, ...heights);
  if (!heights.some((height) => height > 0)) {
    const focused = EXPENSE_BARS.find((item) => item.id === focus);
    return (
      <p className="text-sm text-muted-foreground">
        {focused
          ? `No ${focused.label} in this range.`
          : "No expenses recorded in this range."}
      </p>
    );
  }
  const labelStep = points.length > 16 ? 5 : points.length > 8 ? 2 : 1;

  return (
    <div>
      <div className="flex h-44 items-end gap-1">
        {points.map((point, index) => {
          const title = bars
            .map((item) => `${item.label} ${money(point[item.id])}`)
            .join(", ");
          return (
            <div
              key={`${point.label}-${index}`}
              className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5"
              title={`${point.label}: ${title}`}
            >
              {bars.map((item) => {
                const amount = point[item.id];
                const height =
                  amount === 0 ? 0 : Math.max(4, (amount / max) * 100);
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-t-sm",
                      item.className,
                      focus ? "w-2/5" : "w-[22%]",
                    )}
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1">
        {points.map((point, index) => (
          <div
            key={`${point.label}-expense-${index}`}
            className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground"
          >
            {index % labelStep === 0 ? point.label.split("–")[0] : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function SeriesLegend<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: ReadonlyArray<{ id: T; label: string; swatch: string }>;
  value: T | null;
  onChange: (value: T | null) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => {
        const pressed = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(pressed ? null : item.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              pressed
                ? "bg-muted font-semibold text-foreground ring-1 ring-foreground/20"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <span className={cn("size-2 rounded-full", item.swatch)} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function cadence(pointCount: number) {
  return pointCount > 20 ? ", grouped by week" : " each day";
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="bg-card shadow-sm">
      <CardHeader className="pb-0">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

const FEE_LEGEND = [
  { id: "academic", label: "Academic", swatch: "bg-chart-3" },
  { id: "discount", label: "Discount", swatch: "bg-neutral-400" },
  { id: "transport", label: "Transport", swatch: "bg-chart-5" },
] as const;

const PAYMENT_LEGEND = [
  { id: "cash", label: "Cash", swatch: "bg-chart-2" },
  { id: "online", label: "Online", swatch: "bg-chart-3" },
] as const;

const EXPENSE_LEGEND = [
  { id: "fuel", label: "Fuel", swatch: "bg-chart-1" },
  { id: "staff", label: "Staff payments", swatch: "bg-chart-4" },
  { id: "stock", label: "Stock", swatch: "bg-chart-3" },
  { id: "other", label: "Other expenses", swatch: "bg-chart-5" },
] as const;

type PaymentSeriesId = (typeof PAYMENT_LEGEND)[number]["id"];

function FeeCollectionChart({ data }: { data: Overview }) {
  const [feeSeries, setFeeSeries] = useState<FeeSeriesId | null>(null);

  return (
    <Card className="bg-card shadow-sm xl:col-span-3">
      <CardHeader>
        <CardTitle>Fee collection</CardTitle>
        <CardDescription>
          {feeSeries === "academic"
            ? `Showing academic fees${cadence(data.points.length)}. Total ${money(data.fees.academic)}.`
            : feeSeries === "discount"
              ? `Showing the academic discount${cadence(data.points.length)}. Total ${money(data.fees.academicDiscount)}.`
              : feeSeries === "transport"
                ? `Showing transport fees${cadence(data.points.length)}. Total ${money(data.fees.transport)}.`
                : `Academic and transport side by side${cadence(data.points.length)}. The grey cap is the academic discount.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SeriesLegend
          label="Fee series"
          items={FEE_LEGEND}
          value={feeSeries}
          onChange={setFeeSeries}
        />
        <FeeColumns points={data.points} focus={feeSeries} />
      </CardContent>
    </Card>
  );
}

function FeePaymentChart({ data }: { data: Overview }) {
  const [paymentSeries, setPaymentSeries] = useState<PaymentSeriesId | null>(
    null,
  );
  const rangeLabel = formatRange(data.from, data.to);

  return (
    <Card className="bg-card shadow-sm xl:col-span-2">
      <CardHeader>
        <CardTitle>How fees were paid</CardTitle>
        <CardDescription>
          {paymentSeries === "cash"
            ? `Showing cash for ${rangeLabel}. Total ${money(data.fees.cash)}.`
            : paymentSeries === "online"
              ? `Showing online payments for ${rangeLabel}. Total ${money(data.fees.online)}.`
              : `Cash and online totals for ${rangeLabel}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <>
            <SeriesLegend
              label="Payment modes"
              items={PAYMENT_LEGEND}
              value={paymentSeries}
              onChange={setPaymentSeries}
            />
            {[
              {
                id: "cash" as const,
                label: "Cash",
                amount: data.fees.cash,
                className: "bg-chart-2",
              },
              {
                id: "online" as const,
                label: "Online",
                amount: data.fees.online,
                className: "bg-chart-3",
              },
            ]
              .filter((row) => !paymentSeries || row.id === paymentSeries)
              .map((row) => {
                const width =
                  data.fees.collected === 0
                    ? 0
                    : Math.round((row.amount / data.fees.collected) * 100);
                return (
                  <div key={row.label} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{row.label}</span>
                      <span className="tabular-nums">{money(row.amount)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", row.className)}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {data.fees.collected - data.fees.cash - data.fees.online > 0.009 ? (
              <p className="text-xs text-muted-foreground">
                Some receipts have no payment mode recorded.
              </p>
            ) : null}
        </>
      </CardContent>
    </Card>
  );
}

function ExpenseChart({ data }: { data: Overview }) {
  const [expenseSeries, setExpenseSeries] = useState<ExpenseSeriesId | null>(
    null,
  );

  return (
    <Card className="bg-card shadow-sm">
      <CardHeader>
        <CardTitle>Expenses</CardTitle>
        <CardDescription>
          {expenseSeries
            ? `Showing ${EXPENSE_BARS.find((item) => item.id === expenseSeries)?.label ?? "expenses"}${cadence(data.points.length)}. Total ${money(data.expenses[expenseSeries])}.`
            : `Fuel, staff payments, stock, and other expenses${cadence(data.points.length)}. Total ${money(data.expenses.total)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SeriesLegend
          label="Expense series"
          items={EXPENSE_LEGEND}
          value={expenseSeries}
          onChange={setExpenseSeries}
        />
        <ExpenseColumns points={data.points} focus={expenseSeries} />
      </CardContent>
    </Card>
  );
}

export function DashboardOverview() {
  const [period, setPeriod] = useState(defaultPeriod);
  const { from, to } = periodBounds(period);
  const tooLong = dayCount(from, to) > 190;
  const today = useMemo(() => isoDate(new Date()), []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const me = useQuery(api.users.me);
  const headcount = useQuery(
    api.dashboard.todayHeadcount,
    mounted && me?.role === "super_admin" ? { date: today } : "skip",
  );
  const data = useQuery(
    api.dashboard.overview,
    tooLong ? "skip" : { from, to },
  );

  return (
    <section className="space-y-4">
      {mounted && me?.role === "super_admin" ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Today
            </h2>
            <p className="text-sm text-muted-foreground">{formatRange(today, today)}</p>
          </div>
          {headcount === undefined ? (
            <p className="text-sm text-muted-foreground">Loading today's counts…</p>
          ) : headcount === null ? null : (
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Students"
                value={String(headcount.enrolled)}
                detail="Enrolled in the school"
              />
              <Stat
                label="Present"
                value={String(headcount.present)}
                detail="Marked present today"
              />
              <Stat
                label="Absent"
                value={String(headcount.absent)}
                detail="Marked absent today"
              />
            </div>
          )}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            School pulse
          </h2>
          <p className="text-sm text-muted-foreground">
            {tooLong
              ? "Choose a range of 190 days or less."
              : data
                ? formatRange(data.from, data.to)
                : "Loading figures…"}
          </p>
        </div>
        <PeriodControl period={period} onChange={setPeriod} />
      </div>

      {tooLong ? null : data === undefined ? (
        <p className="text-sm text-muted-foreground">Loading statistics…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.showFees ? (
              <Stat
                label="Fee collection"
                value={money(data.fees.collected)}
                detail={`${data.fees.paymentCount} payment${data.fees.paymentCount === 1 ? "" : "s"}`}
              />
            ) : null}
            {data.showExpenses ? (
              <Stat
                label="Expenses"
                value={money(data.expenses.total)}
                detail={`Fuel ${money(data.expenses.fuel)} · Staff ${money(data.expenses.staff)} · Stock ${money(data.expenses.stock)} · Other ${money(data.expenses.other)}`}
              />
            ) : null}
            {data.showFees ? (
              <Stat
                label="Academic / transport"
                value={money(data.fees.academic)}
                detail={`Transport ${money(data.fees.transport)}`}
              />
            ) : (
              <Stat
                label="Late"
                value={String(data.attendance.late)}
                detail="Counted separately from present"
              />
            )}
          </div>

          {data.showFees ? (
            <div className="grid gap-4 xl:grid-cols-5">
              <FeeCollectionChart data={data} />
              <FeePaymentChart data={data} />
            </div>
          ) : null}

          {data.showExpenses ? <ExpenseChart data={data} /> : null}
        </>
      )}
    </section>
  );
}
