"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const RANGES = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "half", label: "6 months" },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeFor(preset: RangeId) {
  const end = new Date();
  const start = new Date(end);
  if (preset === "week") {
    start.setDate(end.getDate() - 6);
  } else if (preset === "month") {
    start.setDate(end.getDate() - 29);
  } else if (preset === "half") {
    start.setDate(end.getDate() - 182);
  }
  return { from: isoDate(start), to: isoDate(end) };
}

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

function StackedColumns({
  points,
  series,
  empty,
}: {
  points: Array<{
    label: string;
    present: number;
    absent: number;
    late: number;
    academic: number;
    transport: number;
  }>;
  series: Array<{
    key: "present" | "absent" | "late" | "academic" | "transport";
    className: string;
  }>;
  empty: string;
}) {
  const totals = points.map((point) =>
    series.reduce((sum, item) => sum + point[item.key], 0),
  );
  const max = Math.max(1, ...totals);
  const hasData = totals.some((total) => total > 0);
  if (!hasData) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  const labelStep = points.length > 16 ? 5 : points.length > 8 ? 2 : 1;

  return (
    <div>
      <div className="flex h-44 items-end gap-1">
        {points.map((point, index) => {
          const total = totals[index] ?? 0;
          const height = total === 0 ? 0 : Math.max(4, (total / max) * 100);
          const parts = series
            .map((item) => `${item.key} ${point[item.key]}`)
            .join(", ");
          return (
            <div
              key={`${point.label}-${index}`}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${point.label}: ${parts}`}
            >
              <div
                className="flex w-full flex-col overflow-hidden rounded-t-sm"
                style={{ height: `${height}%` }}
              >
                {series.map((item) =>
                  point[item.key] > 0 ? (
                    <div
                      key={item.key}
                      className={cn("min-h-0", item.className)}
                      style={{ flexGrow: point[item.key] }}
                    />
                  ) : null,
                )}
              </div>
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

const ATTENDANCE_LEGEND = [
  { id: "present", label: "Present", swatch: "bg-chart-1" },
  { id: "late", label: "Late", swatch: "bg-chart-2" },
  { id: "absent", label: "Absent", swatch: "bg-chart-4" },
] as const;

const ATTENDANCE_STACK = [
  { key: "absent", className: "bg-chart-4" },
  { key: "late", className: "bg-chart-2" },
  { key: "present", className: "bg-chart-1" },
] as const;

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

type AttendanceSeriesId = (typeof ATTENDANCE_LEGEND)[number]["id"];
type PaymentSeriesId = (typeof PAYMENT_LEGEND)[number]["id"];

export function DashboardOverview() {
  const [preset, setPreset] = useState<RangeId>("today");
  const [attendanceSeries, setAttendanceSeries] =
    useState<AttendanceSeriesId | null>(null);
  const [feeSeries, setFeeSeries] = useState<FeeSeriesId | null>(null);
  const [paymentSeries, setPaymentSeries] = useState<PaymentSeriesId | null>(
    null,
  );
  const [expenseSeries, setExpenseSeries] = useState<ExpenseSeriesId | null>(
    null,
  );
  const { from, to } = useMemo(() => rangeFor(preset), [preset]);
  const data = useQuery(api.dashboard.overview, { from, to });
  const rangeLabel = RANGES.find((item) => item.id === preset)?.label ?? "Today";

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            School pulse
          </h2>
          <p className="text-sm text-muted-foreground">
            {data ? formatRange(data.from, data.to) : "Loading figures…"}
          </p>
        </div>
        <div className="flex w-fit rounded-lg bg-muted p-1">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                preset === item.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setPreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {data === undefined ? (
        <p className="text-sm text-muted-foreground">Loading statistics…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Attendance"
              value={
                data.attendance.rate === null ? "—" : `${data.attendance.rate}%`
              }
              detail={
                data.attendance.marked === 0
                  ? "No attendance marked in this range"
                  : `${data.attendance.present} present of ${data.attendance.marked} marks`
              }
            />
            <Stat
              label="Absent"
              value={String(data.attendance.absent)}
              detail={`${data.attendance.late} late in the same period`}
            />
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

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="bg-card shadow-sm">
              <CardHeader>
                <CardTitle>
                  {data.scope === "family"
                    ? "Attendance by student"
                    : "Attendance by class"}
                </CardTitle>
                <CardDescription>
                  Present marks as a share of marks saved in this range. Unmarked
                  students are left out.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {data.scope === "classes"
                      ? "No classes are assigned to you."
                      : "No enrolled students in this view."}
                  </p>
                ) : (
                  data.groups.map((group, index) => (
                    <div key={`${group.label}-${index}`} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">{group.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {group.rate === null ? "No marks" : `${group.rate}%`}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-chart-1"
                          style={{ width: `${group.rate ?? 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {group.present} present · {group.absent} absent · {group.late}{" "}
                        late
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="bg-card shadow-sm">
              <CardHeader>
                <CardTitle>Attendance over time</CardTitle>
                <CardDescription>
                  {attendanceSeries
                    ? `Showing ${attendanceSeries} marks${cadence(data.points.length)}. Total ${data.attendance[attendanceSeries]}.`
                    : `Present, late, and absent marks${cadence(data.points.length)}.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <SeriesLegend
                  label="Attendance series"
                  items={ATTENDANCE_LEGEND}
                  value={attendanceSeries}
                  onChange={setAttendanceSeries}
                />
                <StackedColumns
                  points={data.points}
                  series={ATTENDANCE_STACK.filter(
                    (item) =>
                      !attendanceSeries || item.key === attendanceSeries,
                  )}
                  empty={
                    attendanceSeries
                      ? `No ${attendanceSeries} marks in this range.`
                      : "No attendance marked in this range."
                  }
                />
              </CardContent>
            </Card>
          </div>

          {data.showFees ? (
            <div className="grid gap-4 xl:grid-cols-5">
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
              <Card className="bg-card shadow-sm xl:col-span-2">
                <CardHeader>
                  <CardTitle>How fees were paid</CardTitle>
                  <CardDescription>
                    {paymentSeries === "cash"
                      ? `Showing cash for ${rangeLabel.toLowerCase()}. Total ${money(data.fees.cash)}.`
                      : paymentSeries === "online"
                        ? `Showing online payments for ${rangeLabel.toLowerCase()}. Total ${money(data.fees.online)}.`
                        : `Cash and online totals for ${rangeLabel.toLowerCase()}.`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                  {data.fees.collected -
                    data.fees.cash -
                    data.fees.online >
                  0.009 ? (
                    <p className="text-xs text-muted-foreground">
                      Some receipts have no payment mode recorded.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {data.showExpenses ? (
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
          ) : null}
        </>
      )}
    </section>
  );
}
