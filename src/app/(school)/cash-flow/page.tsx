"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { toast } from "sonner";
import { canViewSchoolAdmin, isSchoolAdmin } from "@/lib/access";
import { mutationResult } from "@/lib/result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PaymentMode = "cash" | "online";
type CreditSource = "fee" | "transport" | "fund";
type ExpenseKind = "salary" | "office" | "fuel" | "stock";

const MAX_AMOUNT = 10_000_000;
const MAX_NOTE = 200;

function money(value: number) {
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
}

function formatDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function todayInIndia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function modeLabel(mode: PaymentMode | undefined) {
  if (mode === "cash") {
    return "Cash";
  }
  if (mode === "online") {
    return "Online";
  }
  return "—";
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type MonthPoint = {
  month: string;
  label: string;
  credit: number;
  debit: number;
  balance: number;
};

function monthSeries(
  movements: { date: string; direction: "credit" | "debit"; amount: number }[],
): MonthPoint[] {
  const credits = new Map<string, number>();
  const debits = new Map<string, number>();
  for (const movement of movements) {
    const month = movement.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(movement.amount)) {
      continue;
    }
    const cents = Math.round(movement.amount * 100);
    const bucket = movement.direction === "credit" ? credits : debits;
    bucket.set(month, (bucket.get(month) ?? 0) + cents);
  }
  const months = [...new Set([...credits.keys(), ...debits.keys()])].sort();
  let running = 0;
  return months.map((month) => {
    const credit = credits.get(month) ?? 0;
    const debit = debits.get(month) ?? 0;
    running += credit - debit;
    const [year, monthNumber] = month.split("-").map(Number);
    return {
      month,
      label: `${MONTH_LABELS[monthNumber - 1] ?? month} ${String(year).slice(2)}`,
      credit: credit / 100,
      debit: debit / 100,
      balance: running / 100,
    };
  });
}

type CreditMonthPoint = {
  month: string;
  label: string;
  fees: number;
  transport: number;
  funds: number;
};

type CreditRow = {
  id: string;
  date: string;
  description: string;
  direction: "credit" | "debit";
  amount: number;
  mode?: PaymentMode;
  source?: CreditSource;
  expense?: ExpenseKind;
};

const CREDIT_SOURCES: {
  source: CreditSource;
  label: string;
  swatch: string;
  amount: string;
}[] = [
  {
    source: "fee",
    label: "Fees",
    swatch: "bg-green-600 dark:bg-green-400",
    amount: "text-green-700 dark:text-green-400",
  },
  {
    source: "transport",
    label: "Transport",
    swatch: "bg-blue-600 dark:bg-blue-400",
    amount: "text-blue-700 dark:text-blue-400",
  },
  {
    source: "fund",
    label: "Funds",
    swatch: "bg-[#eab308] dark:bg-[#eab308]",
    amount: "text-[#ca8a04] dark:text-[#eab308]",
  },
];

function creditSourceOf(movement: {
  direction: "credit" | "debit";
  description: string;
  source?: CreditSource;
}): CreditSource | null {
  if (movement.direction !== "credit") {
    return null;
  }
  if (
    movement.source === "fee" ||
    movement.source === "transport" ||
    movement.source === "fund"
  ) {
    return movement.source;
  }
  if (
    movement.description === "Transport" ||
    movement.description.startsWith("Transport — ") ||
    movement.description.startsWith("Transport —")
  ) {
    return "transport";
  }
  if (
    movement.description === "Fund" ||
    movement.description.startsWith("Fund — ") ||
    movement.description.startsWith("Fund —")
  ) {
    return "fund";
  }
  return "fee";
}

function creditMonthSeries(
  movements: {
    date: string;
    direction: "credit" | "debit";
    amount: number;
    description: string;
    source?: CreditSource;
  }[],
): CreditMonthPoint[] {
  const fees = new Map<string, number>();
  const transport = new Map<string, number>();
  const funds = new Map<string, number>();
  const seen = new Set<string>();
  for (const movement of movements) {
    const month = movement.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(movement.amount)) {
      continue;
    }
    seen.add(month);
    const source = creditSourceOf(movement);
    if (!source) {
      continue;
    }
    const cents = Math.round(movement.amount * 100);
    const bucket =
      source === "fee" ? fees : source === "transport" ? transport : funds;
    bucket.set(month, (bucket.get(month) ?? 0) + cents);
  }
  return [...seen].sort().map((month) => {
    const [year, monthNumber] = month.split("-").map(Number);
    return {
      month,
      label: `${MONTH_LABELS[monthNumber - 1] ?? month} ${String(year).slice(2)}`,
      fees: (fees.get(month) ?? 0) / 100,
      transport: (transport.get(month) ?? 0) / 100,
      funds: (funds.get(month) ?? 0) / 100,
    };
  });
}

function creditTotal(point: { fees: number; transport: number; funds: number }) {
  return point.fees + point.transport + point.funds;
}

function creditDaySeries(rows: CreditRow[]) {
  const fees = new Map<string, number>();
  const transport = new Map<string, number>();
  const funds = new Map<string, number>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(row.amount)) {
      continue;
    }
    const source = creditSourceOf(row);
    if (!source) {
      continue;
    }
    const cents = Math.round(row.amount * 100);
    if (cents <= 0) {
      continue;
    }
    const bucket =
      source === "fee" ? fees : source === "transport" ? transport : funds;
    bucket.set(row.date, (bucket.get(row.date) ?? 0) + cents);
  }
  return [...new Set([...fees.keys(), ...transport.keys(), ...funds.keys()])]
    .sort()
    .map((date) => ({
      date,
      fees: (fees.get(date) ?? 0) / 100,
      transport: (transport.get(date) ?? 0) / 100,
      funds: (funds.get(date) ?? 0) / 100,
    }));
}

function CreditLegend() {
  return (
    <ul className="grid h-10 grid-cols-2 content-start gap-x-2 text-xs leading-4 text-muted-foreground">
      {CREDIT_SOURCES.map((item) => (
        <li key={item.source} className="flex items-center gap-1.5">
          <span className={`size-2 rounded-sm ${item.swatch}`} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function CreditSegments({
  point,
}: {
  point: { fees: number; transport: number; funds: number };
}) {
  const parts = [
    { source: "fund" as const, value: point.funds },
    { source: "transport" as const, value: point.transport },
    { source: "fee" as const, value: point.fees },
  ];
  return (
    <>
      {parts.map((part) => {
        if (part.value <= 0) {
          return null;
        }
        const swatch = CREDIT_SOURCES.find(
          (item) => item.source === part.source,
        )?.swatch;
        return (
          <span
            key={part.source}
            className={`block min-h-0 w-full ${swatch ?? ""}`}
            style={{ flexGrow: part.value, flexBasis: 0 }}
          />
        );
      })}
    </>
  );
}

function CreditMonthDetail({
  point,
  rows,
}: {
  point: CreditMonthPoint;
  rows: CreditRow[];
}) {
  const days = creditDaySeries(rows);
  const plot = 112;
  let max = 0;
  for (const day of days) {
    max = Math.max(max, creditTotal(day));
  }
  const wide = days.length > 0 && days.length <= 8;
  const slot = wide ? 48 : days.length > 14 ? 28 : 36;
  const barWidth = wide ? 18 : days.length > 14 ? 12 : 16;
  const chartWidth = Math.max(days.length, 1) * slot;

  return (
    <div className="space-y-2 rounded-lg px-3 py-2.5 ring-1 ring-foreground/10">
      <p className="text-xs text-muted-foreground">Credits by day</p>
      {days.length === 0 ? null : (
        <div className="flex items-start gap-1.5">
          <div
            className="flex shrink-0 flex-col justify-between text-right text-[10px] leading-none text-muted-foreground tabular-nums"
            style={{ height: plot }}
          >
            <span>{money(max)}</span>
            <span>₹0</span>
          </div>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div style={{ minWidth: chartWidth }}>
              <div
                role="group"
                aria-label={`Credits by day in ${point.label}`}
                className="flex items-end border-b border-foreground/25"
                style={{ height: plot }}
              >
                {days.map((day) => {
                  const total = creditTotal(day);
                  const height = max > 0 ? (total / max) * plot : 0;
                  const summary = `${formatDay(day.date)}: ${money(total)}. Fees ${money(day.fees)}, transport ${money(day.transport)}, funds ${money(day.funds)}.`;
                  return (
                    <div
                      key={day.date}
                      className="flex h-full shrink-0 items-end justify-center"
                      style={{ width: slot }}
                    >
                      <div
                        role="img"
                        title={summary}
                        aria-label={summary}
                        className="flex flex-col overflow-hidden rounded-t-[3px]"
                        style={{ height, width: barWidth }}
                      >
                        <CreditSegments point={day} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex">
                {days.map((day) => {
                  const dayNumber = Number(day.date.slice(8, 10));
                  const monthName =
                    MONTH_LABELS[Number(day.date.slice(5, 7)) - 1] ?? "";
                  return (
                    <span
                      key={day.date}
                      className="shrink-0 pt-1 text-center text-[11px] leading-4 text-muted-foreground"
                      style={{ width: slot }}
                    >
                      {wide ? `${dayNumber} ${monthName}` : dayNumber}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreditBreakdown({
  point,
}: {
  point: { fees: number; transport: number; funds: number };
}) {
  return (
    <ul className="space-y-1">
      {CREDIT_SOURCES.map((item) => {
        const value =
          item.source === "fee"
            ? point.fees
            : item.source === "transport"
              ? point.transport
              : point.funds;
        return (
          <li key={item.source} className="flex items-center gap-1.5 text-xs">
            <span className={`size-2 shrink-0 rounded-sm ${item.swatch}`} aria-hidden />
            <span className="text-muted-foreground">{item.label}</span>
            <span className={`font-medium tabular-nums ${item.amount}`}>
              {money(value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CreditMonthChart({
  points,
  rows,
  selectedMonth,
  onSelectMonth,
}: {
  points: CreditMonthPoint[];
  rows: CreditRow[];
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const barRefs = useRef(new Map<string, HTMLButtonElement>());
  const selected = points.find((point) => point.month === selectedMonth) ?? null;

  useEffect(() => {
    if (selectedMonth) {
      backRef.current?.focus();
    }
  }, [selectedMonth]);

  function showMonth(month: string) {
    onSelectMonth(month);
  }

  function showChart(focusMonth?: string) {
    onSelectMonth(null);
    if (focusMonth) {
      requestAnimationFrame(() => {
        barRefs.current.get(focusMonth)?.focus();
      });
    }
  }

  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">No movements yet.</p>;
  }

  if (selected) {
    const monthRows = rows
      .filter(
        (row) =>
          row.date.slice(0, 7) === selected.month && creditSourceOf(row) !== null,
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const total = creditTotal(selected);
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <Button
            ref={backRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => showChart(selected.month)}
          >
            All months
          </Button>
          <p className="text-right text-sm leading-tight font-medium">
            <span className="block">{selected.label}</span>
            <span className="text-green-700 tabular-nums dark:text-green-400">
              {money(total)}
            </span>
          </p>
        </div>
        <CreditMonthDetail point={selected} rows={monthRows} />
      </div>
    );
  }

  let max = 0;
  for (const point of points) {
    max = Math.max(max, creditTotal(point));
  }
  const scale = max > 0 ? max * 1.12 : 1;

  const plotHeight = 120;
  const slot = 56;
  const barWidth = 22;

  const spread = points.length <= 6;

  return (
    <div className="flex h-full flex-col gap-2">
      <CreditLegend />
      <p className="text-xs leading-4 text-muted-foreground">Credits by month</p>
      <div className="mt-auto overflow-x-auto">
        <div
          className={spread ? "w-full" : "px-1.5"}
          style={
            spread ? undefined : { minWidth: points.length * slot + 12 }
          }
        >
          <div
            role="group"
            aria-label="Credits by month"
            className="flex items-end border-b border-foreground/20"
            style={{ height: plotHeight }}
          >
            {points.map((point) => {
              const total = creditTotal(point);
              const height =
                total > 0
                  ? Math.max((total / scale) * (plotHeight - 8), 4)
                  : 0;
              return (
                <div
                  key={point.month}
                  className={
                    spread
                      ? "flex h-full min-w-0 flex-1 items-end justify-center"
                      : "flex h-full shrink-0 items-end justify-center"
                  }
                  style={spread ? undefined : { width: slot }}
                >
                  {total > 0 ? (
                    <button
                      ref={(node) => {
                        if (node) {
                          barRefs.current.set(point.month, node);
                        } else {
                          barRefs.current.delete(point.month);
                        }
                      }}
                      type="button"
                      onClick={() => showMonth(point.month)}
                      title={`${point.label}: ${money(total)}`}
                      aria-label={`${point.label}, ${money(total)}. Fees ${money(point.fees)}, transport ${money(point.transport)}, funds ${money(point.funds)}. Show this month.`}
                      className="flex flex-col overflow-hidden rounded-t-[3px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      style={{ height, width: barWidth }}
                    >
                      <CreditSegments point={point} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex">
            {points.map((point) => (
              <span
                key={point.month}
                className={
                  spread
                    ? "min-w-0 flex-1 pt-1 text-center text-[11px] leading-4 text-muted-foreground"
                    : "shrink-0 pt-1 text-center text-[11px] leading-4 text-muted-foreground"
                }
                style={spread ? undefined : { width: slot }}
              >
                {point.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type DebitMonthPoint = {
  month: string;
  label: string;
  salary: number;
  office: number;
  fuel: number;
  stock: number;
};

type DebitParts = {
  salary: number;
  office: number;
  fuel: number;
  stock: number;
};

const EXPENSE_KINDS: {
  kind: ExpenseKind;
  label: string;
  swatch: string;
  amount: string;
}[] = [
  {
    kind: "salary",
    label: "Staff payments",
    swatch: "bg-[#dc2626] dark:bg-[#f87171]",
    amount: "text-[#dc2626] dark:text-[#f87171]",
  },
  {
    kind: "office",
    label: "Office expenses",
    swatch: "bg-[#ea580c] dark:bg-[#fb923c]",
    amount: "text-[#c2410c] dark:text-[#fb923c]",
  },
  {
    kind: "fuel",
    label: "Fuel",
    swatch: "bg-[#7c3aed] dark:bg-[#a78bfa]",
    amount: "text-[#6d28d9] dark:text-[#a78bfa]",
  },
  {
    kind: "stock",
    label: "Stock",
    swatch: "bg-[#0f766e] dark:bg-[#2dd4bf]",
    amount: "text-[#0f766e] dark:text-[#2dd4bf]",
  },
];

function expenseKindOf(movement: {
  direction: "credit" | "debit";
  id: string;
  expense?: ExpenseKind;
}): ExpenseKind | null {
  if (movement.direction !== "debit") {
    return null;
  }
  if (
    movement.expense === "salary" ||
    movement.expense === "office" ||
    movement.expense === "fuel" ||
    movement.expense === "stock"
  ) {
    return movement.expense;
  }
  if (movement.id.startsWith("salary:")) {
    return "salary";
  }
  if (movement.id.startsWith("expense:")) {
    return "office";
  }
  if (movement.id.startsWith("fuel:")) {
    return "fuel";
  }
  if (movement.id.startsWith("stock:")) {
    return "stock";
  }
  return null;
}

function debitPart(
  point: DebitParts,
  kind: ExpenseKind,
) {
  if (kind === "salary") {
    return point.salary;
  }
  if (kind === "office") {
    return point.office;
  }
  if (kind === "fuel") {
    return point.fuel;
  }
  return point.stock;
}

function debitMonthSeries(
  movements: {
    id: string;
    date: string;
    direction: "credit" | "debit";
    amount: number;
    expense?: ExpenseKind;
  }[],
): DebitMonthPoint[] {
  const salary = new Map<string, number>();
  const office = new Map<string, number>();
  const fuel = new Map<string, number>();
  const stock = new Map<string, number>();
  const seen = new Set<string>();
  for (const movement of movements) {
    const month = movement.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(movement.amount)) {
      continue;
    }
    seen.add(month);
    const kind = expenseKindOf(movement);
    if (!kind) {
      continue;
    }
    const cents = Math.round(movement.amount * 100);
    const bucket =
      kind === "salary"
        ? salary
        : kind === "office"
          ? office
          : kind === "fuel"
            ? fuel
            : stock;
    bucket.set(month, (bucket.get(month) ?? 0) + cents);
  }
  return [...seen].sort().map((month) => {
    const [year, monthNumber] = month.split("-").map(Number);
    return {
      month,
      label: `${MONTH_LABELS[monthNumber - 1] ?? month} ${String(year).slice(2)}`,
      salary: (salary.get(month) ?? 0) / 100,
      office: (office.get(month) ?? 0) / 100,
      fuel: (fuel.get(month) ?? 0) / 100,
      stock: (stock.get(month) ?? 0) / 100,
    };
  });
}

function debitTotal(point: DebitParts) {
  return point.salary + point.office + point.fuel + point.stock;
}

function debitDaySeries(rows: CreditRow[]) {
  const salary = new Map<string, number>();
  const office = new Map<string, number>();
  const fuel = new Map<string, number>();
  const stock = new Map<string, number>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(row.amount)) {
      continue;
    }
    const kind = expenseKindOf(row);
    if (!kind) {
      continue;
    }
    const cents = Math.round(row.amount * 100);
    if (cents <= 0) {
      continue;
    }
    const bucket =
      kind === "salary"
        ? salary
        : kind === "office"
          ? office
          : kind === "fuel"
            ? fuel
            : stock;
    bucket.set(row.date, (bucket.get(row.date) ?? 0) + cents);
  }
  return [
    ...new Set([
      ...salary.keys(),
      ...office.keys(),
      ...fuel.keys(),
      ...stock.keys(),
    ]),
  ]
    .sort()
    .map((date) => ({
      date,
      salary: (salary.get(date) ?? 0) / 100,
      office: (office.get(date) ?? 0) / 100,
      fuel: (fuel.get(date) ?? 0) / 100,
      stock: (stock.get(date) ?? 0) / 100,
    }));
}

function DebitLegend() {
  return (
    <ul className="grid h-10 grid-cols-2 content-start gap-x-2 text-xs leading-4 text-muted-foreground">
      {EXPENSE_KINDS.map((item) => (
        <li key={item.kind} className="flex items-center gap-1.5">
          <span className={`size-2 rounded-sm ${item.swatch}`} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function DebitSegments({ point }: { point: DebitParts }) {
  const parts = [
    { kind: "stock" as const, value: point.stock },
    { kind: "fuel" as const, value: point.fuel },
    { kind: "office" as const, value: point.office },
    { kind: "salary" as const, value: point.salary },
  ];
  return (
    <>
      {parts.map((part) => {
        if (part.value <= 0) {
          return null;
        }
        const swatch = EXPENSE_KINDS.find(
          (item) => item.kind === part.kind,
        )?.swatch;
        return (
          <span
            key={part.kind}
            className={`block min-h-0 w-full ${swatch ?? ""}`}
            style={{ flexGrow: part.value, flexBasis: 0 }}
          />
        );
      })}
    </>
  );
}

function debitBreakdown(point: DebitParts) {
  return EXPENSE_KINDS.map(
    (item) => `${item.label} ${money(debitPart(point, item.kind))}`,
  ).join(", ");
}

function DebitMonthDetail({
  point,
  rows,
}: {
  point: DebitMonthPoint;
  rows: CreditRow[];
}) {
  const days = debitDaySeries(rows);
  const plot = 112;
  let max = 0;
  for (const day of days) {
    max = Math.max(max, debitTotal(day));
  }
  const wide = days.length > 0 && days.length <= 8;
  const slot = wide ? 48 : days.length > 14 ? 28 : 36;
  const barWidth = wide ? 18 : days.length > 14 ? 12 : 16;
  const chartWidth = Math.max(days.length, 1) * slot;

  return (
    <div className="space-y-2 rounded-lg px-3 py-2.5 ring-1 ring-foreground/10">
      <p className="text-xs text-muted-foreground">Debits by day</p>
      {days.length === 0 ? null : (
        <div className="flex items-start gap-1.5">
          <div
            className="flex shrink-0 flex-col justify-between text-right text-[10px] leading-none text-muted-foreground tabular-nums"
            style={{ height: plot }}
          >
            <span>{money(max)}</span>
            <span>₹0</span>
          </div>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div style={{ minWidth: chartWidth }}>
              <div
                role="group"
                aria-label={`Debits by day in ${point.label}`}
                className="flex items-end border-b border-foreground/25"
                style={{ height: plot }}
              >
                {days.map((day) => {
                  const total = debitTotal(day);
                  const height = max > 0 ? (total / max) * plot : 0;
                  const summary = `${formatDay(day.date)}: ${money(total)}. ${debitBreakdown(day)}.`;
                  return (
                    <div
                      key={day.date}
                      className="flex h-full shrink-0 items-end justify-center"
                      style={{ width: slot }}
                    >
                      <div
                        role="img"
                        title={summary}
                        aria-label={summary}
                        className="flex flex-col overflow-hidden rounded-t-[3px]"
                        style={{ height, width: barWidth }}
                      >
                        <DebitSegments point={day} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex">
                {days.map((day) => {
                  const dayNumber = Number(day.date.slice(8, 10));
                  const monthName =
                    MONTH_LABELS[Number(day.date.slice(5, 7)) - 1] ?? "";
                  return (
                    <span
                      key={day.date}
                      className="shrink-0 pt-1 text-center text-[11px] leading-4 text-muted-foreground"
                      style={{ width: slot }}
                    >
                      {wide ? `${dayNumber} ${monthName}` : dayNumber}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DebitBreakdown({ point }: { point: DebitParts }) {
  return (
    <ul className="space-y-1">
      {EXPENSE_KINDS.map((item) => (
        <li key={item.kind} className="flex items-center gap-1.5 text-xs">
          <span className={`size-2 shrink-0 rounded-sm ${item.swatch}`} aria-hidden />
          <span className="text-muted-foreground">{item.label}</span>
          <span className={`font-medium tabular-nums ${item.amount}`}>
            {money(debitPart(point, item.kind))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DebitMonthChart({
  points,
  rows,
  selectedMonth,
  onSelectMonth,
}: {
  points: DebitMonthPoint[];
  rows: CreditRow[];
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const barRefs = useRef(new Map<string, HTMLButtonElement>());
  const selected = points.find((point) => point.month === selectedMonth) ?? null;

  useEffect(() => {
    if (selectedMonth) {
      backRef.current?.focus();
    }
  }, [selectedMonth]);

  function showMonth(month: string) {
    onSelectMonth(month);
  }

  function showChart(focusMonth?: string) {
    onSelectMonth(null);
    if (focusMonth) {
      requestAnimationFrame(() => {
        barRefs.current.get(focusMonth)?.focus();
      });
    }
  }

  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">No movements yet.</p>;
  }

  if (selected) {
    const monthRows = rows
      .filter(
        (row) =>
          row.date.slice(0, 7) === selected.month && expenseKindOf(row) !== null,
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const total = debitTotal(selected);
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <Button
            ref={backRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => showChart(selected.month)}
          >
            All months
          </Button>
          <p className="text-right text-sm leading-tight font-medium">
            <span className="block">{selected.label}</span>
            <span className="text-[#dc2626] tabular-nums dark:text-[#f87171]">
              {money(total)}
            </span>
          </p>
        </div>
        <DebitMonthDetail point={selected} rows={monthRows} />
      </div>
    );
  }

  let max = 0;
  for (const point of points) {
    max = Math.max(max, debitTotal(point));
  }
  const scale = max > 0 ? max * 1.12 : 1;

  const plotHeight = 120;
  const slot = 56;
  const barWidth = 22;

  const spread = points.length <= 6;

  return (
    <div className="flex h-full flex-col gap-2">
      <DebitLegend />
      <p className="text-xs leading-4 text-muted-foreground">Debits by month</p>
      <div className="mt-auto overflow-x-auto">
        <div
          className={spread ? "w-full" : "px-1.5"}
          style={
            spread ? undefined : { minWidth: points.length * slot + 12 }
          }
        >
          <div
            role="group"
            aria-label="Debits by month"
            className="flex items-end border-b border-foreground/20"
            style={{ height: plotHeight }}
          >
            {points.map((point) => {
              const total = debitTotal(point);
              const height =
                total > 0
                  ? Math.max((total / scale) * (plotHeight - 8), 4)
                  : 0;
              return (
                <div
                  key={point.month}
                  className={
                    spread
                      ? "flex h-full min-w-0 flex-1 items-end justify-center"
                      : "flex h-full shrink-0 items-end justify-center"
                  }
                  style={spread ? undefined : { width: slot }}
                >
                  {total > 0 ? (
                    <button
                      ref={(node) => {
                        if (node) {
                          barRefs.current.set(point.month, node);
                        } else {
                          barRefs.current.delete(point.month);
                        }
                      }}
                      type="button"
                      onClick={() => showMonth(point.month)}
                      title={`${point.label}: ${money(total)}`}
                      aria-label={`${point.label}, ${money(total)}. ${debitBreakdown(point)}. Show this month.`}
                      className="flex flex-col overflow-hidden rounded-t-[3px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      style={{ height, width: barWidth }}
                    >
                      <DebitSegments point={point} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex">
            {points.map((point) => (
              <span
                key={point.month}
                className={
                  spread
                    ? "min-w-0 flex-1 pt-1 text-center text-[11px] leading-4 text-muted-foreground"
                    : "shrink-0 pt-1 text-center text-[11px] leading-4 text-muted-foreground"
                }
                style={spread ? undefined : { width: slot }}
              >
                {point.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CashMonthChart({
  caption,
  points,
  valueOf,
  tone,
}: {
  caption: string;
  points: MonthPoint[];
  valueOf: (point: MonthPoint) => number;
  tone: "credit" | "debit" | "balance";
}) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">No movements yet.</p>;
  }

  const values = points.map(valueOf);
  let min = 0;
  let max = 0;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (max === 0 && min === 0) {
    max = 1;
  } else {
    if (max > 0) {
      max *= 1.12;
    }
    if (min < 0) {
      min *= 1.12;
    }
  }

  const plotHeight = 120;
  const slot = 56;
  const barWidth = 22;
  const scale = Math.max(Math.abs(max), Math.abs(min), 1);
  const spread = points.length <= 6;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="h-10" aria-hidden />
      <p className="text-xs leading-4 text-muted-foreground">{caption}</p>
      <div className="mt-auto overflow-x-auto">
        <div
          className={spread ? "w-full" : undefined}
          style={spread ? undefined : { minWidth: points.length * slot }}
        >
          <div
            role="group"
            aria-label={caption}
            className="flex items-end border-b border-foreground/20"
            style={{ height: plotHeight }}
          >
            {points.map((point, index) => {
              const value = values[index] ?? 0;
              const negative = tone === "debit" || (tone === "balance" && value < 0);
              const height =
                value === 0
                  ? 0
                  : Math.max((Math.abs(value) / scale) * (plotHeight - 8), 4);
              return (
                <div
                  key={point.month}
                  className={
                    spread
                      ? "flex h-full min-w-0 flex-1 items-end justify-center"
                      : "flex h-full shrink-0 items-end justify-center"
                  }
                  style={spread ? undefined : { width: slot }}
                >
                  {height > 0 ? (
                    <div
                      role="img"
                      title={`${point.label}: ${money(value)}`}
                      aria-label={`${point.label}: ${money(value)}`}
                      className={
                        negative
                          ? "rounded-t-[3px] bg-red-600 dark:bg-red-400"
                          : "rounded-t-[3px] bg-green-600 dark:bg-green-400"
                      }
                      style={{ height, width: barWidth }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex">
            {points.map((point) => (
              <span
                key={point.month}
                className={
                  spread
                    ? "min-w-0 flex-1 pt-1 text-center text-[11px] leading-4 text-muted-foreground"
                    : "shrink-0 pt-1 text-center text-[11px] leading-4 text-muted-foreground"
                }
                style={spread ? undefined : { width: slot }}
              >
                {point.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function parseAmount(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return null;
  }
  return amount;
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return value;
}

export default function CashFlowPage() {
  const me = useQuery(api.users.me);
  const allowed = me ? canViewSchoolAdmin(me) : false;
  const canEdit = me ? isSchoolAdmin(me) : false;
  const summary = useQuery(api.cashFlow.summary, allowed ? {} : "skip");
  const addFund = useMutation(api.cashFlow.addFund);
  const [creditMonth, setCreditMonth] = useState<string | null>(null);
  const [debitMonth, setDebitMonth] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInIndia);
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [saving, setSaving] = useState(false);

  function openForm() {
    setAmount("");
    setDate(todayInIndia());
    setNote("");
    setMode("cash");
    setOpen(true);
  }

  async function onSave(event?: React.FormEvent) {
    event?.preventDefault();
    if (saving) {
      return;
    }
    const parsedAmount = parseAmount(amount);
    const parsedDate = parseDate(date);
    const text = note.trim();
    if (parsedAmount === null) {
      toast.error(
        "Enter an amount greater than 0, up to 10,000,000, with at most 2 decimal places",
      );
      return;
    }
    if (parsedDate === null) {
      toast.error("Enter a date as YYYY-MM-DD");
      return;
    }
    if (text.length > MAX_NOTE) {
      toast.error("Note is too long");
      return;
    }
    setSaving(true);
    try {
      await addFund({
        amount: parsedAmount,
        date: parsedDate,
        mode,
        ...(text ? { note: text } : {}),
      });
      toast.success("Fund added");
      setOpen(false);
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  if (me === undefined || (allowed && summary === undefined)) {
    return <p className="text-sm text-muted-foreground">Loading cash flow…</p>;
  }
  if (me === null) {
    return (
      <p className="text-sm text-destructive">
        Your account is not available. Sign in again.
      </p>
    );
  }
  if (!allowed || summary === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        Only super admins and data entry can open cash flow.
      </p>
    );
  }

  const months = monthSeries(summary.movements);
  const creditMonths = creditMonthSeries(summary.movements);
  const debitMonths = debitMonthSeries(summary.movements);
  const selectedCredit = creditMonths.find((point) => point.month === creditMonth);
  const selectedDebit = debitMonths.find((point) => point.month === debitMonth);
  const creditLabel = selectedCredit?.label;
  const debitLabel = selectedDebit?.label;
  const movements = summary.movements.filter((movement) => {
    if (!creditMonth && !debitMonth) {
      return true;
    }
    const month = movement.date.slice(0, 7);
    if (creditMonth && movement.direction === "credit" && month === creditMonth) {
      return true;
    }
    if (debitMonth && movement.direction === "debit" && month === debitMonth) {
      return true;
    }
    return false;
  });
  const movementNote =
    creditLabel && debitLabel
      ? creditMonth === debitMonth
        ? `Movements in ${creditLabel}.`
        : `Credits in ${creditLabel} and debits in ${debitLabel}.`
      : creditLabel
        ? `Credits in ${creditLabel}.`
        : debitLabel
          ? `Debits in ${debitLabel}.`
          : "Newest first.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cash flow</h1>
          <p className="text-sm text-muted-foreground">
            Money currently in the school. Balance is total credited minus
            total debited.
          </p>
        </div>
        {canEdit ? (
          <Button type="button" onClick={openForm}>
            Add fund
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Read-only. Observers cannot add funds.
          </p>
        )}
      </div>

      <div className="grid items-stretch gap-4 sm:grid-cols-3">
        <Card className="h-full">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardDescription>Total credited</CardDescription>
                <CardTitle className="text-green-700 dark:text-green-400">
                  {money(summary.credited)}
                </CardTitle>
              </div>
              {selectedCredit ? <CreditBreakdown point={selectedCredit} /> : null}
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <CreditMonthChart
              points={creditMonths}
              rows={summary.movements}
              selectedMonth={creditMonth}
              onSelectMonth={setCreditMonth}
            />
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardDescription>Total debited</CardDescription>
                <CardTitle className="text-red-700 dark:text-red-400">
                  {money(summary.debited)}
                </CardTitle>
              </div>
              {selectedDebit ? <DebitBreakdown point={selectedDebit} /> : null}
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <DebitMonthChart
              points={debitMonths}
              rows={summary.movements}
              selectedMonth={debitMonth}
              onSelectMonth={setDebitMonth}
            />
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardHeader>
            <CardDescription>Balance</CardDescription>
            <CardTitle
              className={
                summary.balance < 0
                  ? "text-red-700 dark:text-red-400"
                  : summary.balance > 0
                    ? "text-green-700 dark:text-green-400"
                    : undefined
              }
            >
              {money(summary.balance)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <CashMonthChart
              caption="Running balance by month"
              points={months}
              valueOf={(point) => point.balance}
              tone="balance"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movements</CardTitle>
          <CardDescription>{movementNote}</CardDescription>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {creditMonth || debitMonth
                ? "No movements in the selected month."
                : "No money movements yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Mode of payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>{formatDay(movement.date)}</TableCell>
                    <TableCell className="font-medium">
                      {movement.description}
                    </TableCell>
                    <TableCell
                      className={
                        movement.direction === "credit"
                          ? "font-medium text-green-700 dark:text-green-400"
                          : "font-medium text-red-700 dark:text-red-400"
                      }
                    >
                      {money(movement.amount)}
                    </TableCell>
                    <TableCell>{modeLabel(movement.mode)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add fund</DialogTitle>
            <DialogDescription>
              Record money added to the school that is not a fee payment.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void onSave(event)}>
            <div className="space-y-2">
              <Label htmlFor="fund-amount">Amount (₹)</Label>
              <Input
                id="fund-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fund-date">Date</Label>
              <Input
                id="fund-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fund-mode">Mode of payment</Label>
              <Select
                value={mode}
                items={{ cash: "Cash", online: "Online" }}
                onValueChange={(next) => {
                  if (next === "cash" || next === "online") {
                    setMode(next);
                  }
                }}
              >
                <SelectTrigger id="fund-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fund-note">Note</Label>
              <Input
                id="fund-note"
                value={note}
                maxLength={MAX_NOTE}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Add fund"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
