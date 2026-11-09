"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PaymentMode = "cash" | "online";

type Payment = {
  id: Id<"staffPayments">;
  amount: number;
  paidOn: string;
  mode: PaymentMode;
  note?: string;
};

type StaffPayRow = {
  userId: Id<"users">;
  name: string;
  roleLabel: string;
  monthlySalary?: number;
  joiningDate?: string;
  paid: number;
  due?: number;
  payments: Payment[];
};

function money(value: number) {
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function cents(value: number) {
  return Math.round(value * 100);
}

function monthLabel(month: string) {
  const [year, raw] = month.split("-");
  const name = MONTH_NAMES[Number(raw) - 1] ?? month;
  return `${name} ${year ?? ""}`.trim();
}

type SalaryMonth = {
  month: string;
  label: string;
  salary: number;
  applied: number;
  left: number;
  status: "Paid" | "Due";
};

function salaryDistribution(row: StaffPayRow, asOf: string): {
  months: SalaryMonth[];
  advance: number;
} {
  if (row.monthlySalary === undefined || !row.joiningDate) {
    return { months: [], advance: 0 };
  }
  if (row.joiningDate.slice(0, 7) > asOf.slice(0, 7)) {
    return { months: [], advance: row.paid };
  }
  const salaryCents = cents(row.monthlySalary);
  let pool = cents(row.paid);
  const months: SalaryMonth[] = [];
  let year = Number(row.joiningDate.slice(0, 4));
  let month = Number(row.joiningDate.slice(5, 7));
  const endYear = Number(asOf.slice(0, 4));
  const endMonth = Number(asOf.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const appliedCents = Math.min(salaryCents, pool);
    pool -= appliedCents;
    const leftCents = salaryCents - appliedCents;
    months.push({
      month: key,
      label: monthLabel(key),
      salary: salaryCents / 100,
      applied: appliedCents / 100,
      left: leftCents / 100,
      status: leftCents === 0 ? "Paid" : "Due",
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { months, advance: pool / 100 };
}

function PayDetail({
  row,
  asOf,
  readOnly = false,
}: {
  row: StaffPayRow;
  asOf: string;
  readOnly?: boolean;
}) {
  const record = useMutation(api.staff.recordPayment);
  const due = row.due;
  const [paidOn, setPaidOn] = useState(todayIso);
  const [amount, setAmount] = useState(due && due > 0 ? String(due) : "");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const distribution = salaryDistribution(row, asOf);

  async function onRecord() {
    const value = Number(amount);
    const cents = Math.round(value * 100);
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      value > 10_000_000 ||
      Math.abs(value * 100 - cents) > 1e-6
    ) {
      toast.error("Enter a payment amount greater than 0");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      toast.error("Choose the date the salary was paid");
      return;
    }
    setSaving(true);
    try {
      await record({
        userId: row.userId,
        amount: value,
        paidOn,
        month: paidOn.slice(0, 7),
        mode,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(`Recorded salary payment for ${row.name}`);
      setNote("");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardDescription>{row.roleLabel}</CardDescription>
        <CardTitle className="text-xl break-words">{row.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <p className="text-muted-foreground">Salary</p>
            <p className="text-lg font-medium break-words tabular-nums">
              {row.monthlySalary === undefined ? "—" : money(row.monthlySalary)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground">Paid</p>
            <p className="text-lg font-medium break-words tabular-nums">
              {row.paid > 0 ? money(row.paid) : "—"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground">Total due</p>
            <p className="text-lg font-medium break-words tabular-nums">
              {due === undefined ? "—" : money(due)}
            </p>
          </div>
        </div>
        {distribution.advance > 0 ? (
          <p className="text-sm text-muted-foreground">
            {money(distribution.advance)} is advance beyond this month. It is
            already counted in Paid and is not part of Total due.
          </p>
        ) : null}
        {distribution.months.length === 0 ? (
          <p className="text-sm text-muted-foreground">No months to charge.</p>
        ) : (
          <>
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Month</th>
                    <th className="py-2 pr-3 font-medium">Salary</th>
                    <th className="py-2 pr-3 font-medium">Applied</th>
                    <th className="py-2 pr-3 font-medium">Left</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {distribution.months.map((line) => (
                    <tr key={line.month} className="border-b last:border-0">
                      <td className="py-2 pr-3">{line.label}</td>
                      <td className="py-2 pr-3 tabular-nums">{money(line.salary)}</td>
                      <td className="py-2 pr-3 tabular-nums">{money(line.applied)}</td>
                      <td className="py-2 pr-3 tabular-nums">{money(line.left)}</td>
                      <td className="py-2">{line.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y rounded-lg border sm:hidden">
              {distribution.months.map((line) => (
                <div key={line.month} className="space-y-2 px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{line.label}</p>
                    <p className="shrink-0">{line.status}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Salary</p>
                      <p className="break-words tabular-nums">{money(line.salary)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Applied</p>
                      <p className="break-words tabular-nums">{money(line.applied)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Left</p>
                      <p className="break-words tabular-nums">{money(line.left)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {readOnly ? (
          <p className="text-sm text-muted-foreground">
            Read-only. Observers cannot record salary.
          </p>
        ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`amount-${row.userId}`}>Amount</Label>
            <Input
              id={`amount-${row.userId}`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`date-${row.userId}`}>Paid on</Label>
              <Input
                id={`date-${row.userId}`}
                type="date"
                className="w-full min-w-0"
                value={paidOn}
                onChange={(event) => setPaidOn(event.target.value)}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`mode-${row.userId}`}>Mode</Label>
              <Select
                value={mode}
                items={{ cash: "Cash", online: "Online" }}
                onValueChange={(next) => {
                  if (next === "cash" || next === "online") {
                    setMode(next);
                  }
                }}
              >
                <SelectTrigger id={`mode-${row.userId}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`note-${row.userId}`}>Note</Label>
            <Input
              id={`note-${row.userId}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={saving}
            onClick={() => void onRecord()}
          >
            {saving ? "Saving…" : "Record"}
          </Button>
        </div>
        )}
        {row.payments.length > 0 ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Payments</p>
            {row.payments.map((payment) => (
              <p key={payment.id} className="text-muted-foreground">
                {payment.paidOn}: {money(payment.amount)} ·{" "}
                {payment.mode === "cash" ? "Cash" : "Online"}
                {payment.note ? ` · ${payment.note}` : ""}
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PaymentRoster({
  rows,
  asOf,
  readOnly = false,
}: {
  rows: StaffPayRow[];
  asOf: string;
  readOnly?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"users"> | null>(null);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter((row) =>
      [row.name, row.roleLabel].some((value) => value.toLowerCase().includes(query)),
    );
  }, [rows, search]);
  const paidTotal = rows.reduce((sum, row) => sum + row.paid, 0);
  const dueTotal = rows.reduce((sum, row) => sum + (row.due ?? 0), 0);

  return (
    <div className="min-w-0 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Total due</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{money(dueTotal)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Salary still owed from each joining date through today.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Paid</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{money(paidTotal)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Payments already recorded.
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-0 max-w-xl flex-1 gap-2">
          <Label htmlFor="payment-search">Search staff</Label>
          <Input
            id="payment-search"
            value={search}
            placeholder="Name or role"
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No staff accounts yet.</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching staff.</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {visible.map((row) => {
            const open = row.userId === selectedId;
            const dueLabel =
              row.due === undefined
                ? ""
                : row.due > 0
                  ? ` · Due ${money(row.due)}`
                  : " · Paid";
            return (
              <div key={row.userId} className="flex min-w-0 flex-col gap-2">
                <button
                  type="button"
                  aria-pressed={open}
                  aria-expanded={open}
                  className="w-full min-w-0 rounded-lg border px-3 py-2 text-left text-sm break-words hover:bg-muted aria-pressed:bg-muted"
                  onClick={() => setSelectedId(row.userId)}
                >
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {row.roleLabel}
                    {dueLabel}
                  </span>
                </button>
                {open ? (
                  <PayDetail
                    key={`${row.userId}:${row.paid}:${row.due ?? ""}:${row.payments.length}`}
                    readOnly={readOnly}
                    row={row}
                    asOf={asOf}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StaffPaymentsPage() {
  const me = useQuery(api.users.me);
  const allowed = me ? canViewSchoolAdmin(me) : false;
  const canEdit = me ? isSchoolAdmin(me) : false;
  const [asOf] = useState(todayIso);
  const rows = useQuery(api.staff.ledger, allowed ? { asOf } : "skip");

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff payments</h1>
        <p className="text-sm text-muted-foreground">
          Record salary paid to each staff member. Total due is every month since they joined, minus payments already recorded.
        </p>
      </div>
      {me === undefined || (allowed && rows === undefined) ? (
        <p className="text-sm text-muted-foreground">Loading staff payments…</p>
      ) : me === null ? (
        <p className="text-sm text-destructive">
          Your account is not available. Sign in again.
        </p>
      ) : !allowed ? (
        <p className="text-sm text-muted-foreground">
          Only super admins and data entry can record staff payments.
        </p>
      ) : rows ? (
        <PaymentRoster rows={rows} asOf={asOf} readOnly={!canEdit} />
      ) : null}
    </div>
  );
}
