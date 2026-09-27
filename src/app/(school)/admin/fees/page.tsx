"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
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

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

type Coverage = "paid" | "partial" | "due" | "upcoming" | "advance";

const coverageLabel: Record<Coverage, string> = {
  paid: "Paid",
  partial: "Part paid",
  due: "Due",
  upcoming: "Upcoming",
  advance: "From advance",
};

type Account = {
  monthlyRate: number;
  chargedToDate: number;
  paid: number;
  due: number;
  advance: number;
  yearTotal: number;
  priorDue: number;
  months: Array<{
    month: string;
    label: string;
    charge: number;
    applied: number;
    balance: number;
    coverage: Coverage;
  }>;
};

type Statement = {
  studentId: Id<"students">;
  studentName: string;
  admissionNumber: string;
  classLabel: string;
  year: number;
  academicEarlierPayments: number;
  academic: Account;
  transportAssigned: boolean;
  transportRouteName?: string;
  transportFromMonth?: string;
  transport: Account;
  academicPayments: Array<{
    id: Id<"feePayments">;
    amount: number;
    paidOn: string;
    note?: string;
  }>;
  transportPayments: Array<{
    id: Id<"feePayments">;
    amount: number;
    paidOn: string;
    note?: string;
  }>;
};

function FeePanel({
  title,
  description,
  account,
  earlierPayments,
  payments,
  canCollect,
  collectLabel,
  onCollect,
}: {
  title: string;
  description: string;
  account: Account;
  earlierPayments?: number;
  payments: Statement["academicPayments"];
  canCollect: boolean;
  collectLabel: string;
  onCollect: (amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">
          {money(account.monthlyRate)}
          <span className="ml-2 text-base font-normal text-muted-foreground">
            / month
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Due now</p>
            <p className="text-lg font-medium tabular-nums">
              {money(account.due)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Advance</p>
            <p className="text-lg font-medium tabular-nums">
              {money(account.advance)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Paid</p>
            <p className="text-lg font-medium tabular-nums">
              {money(account.paid)}
            </p>
          </div>
        </div>
        {account.priorDue > 0 ? (
          <p className="text-sm text-muted-foreground">
            {money(account.priorDue)} of the amount due is from months before{" "}
            {account.months[0]?.label.slice(-4) ?? "this year"}.
          </p>
        ) : null}
        {earlierPayments && earlierPayments > 0 ? (
          <p className="text-sm text-muted-foreground">
            {money(earlierPayments)} from earlier invoices is counted toward
            academic fees.
          </p>
        ) : null}
        {account.months.length === 0 ? (
          <p className="text-sm text-muted-foreground">No months to charge.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Month</th>
                  <th className="py-2 pr-3 font-medium">Fee</th>
                  <th className="py-2 pr-3 font-medium">Applied</th>
                  <th className="py-2 pr-3 font-medium">Left</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {account.months.map((month) => (
                  <tr key={month.month} className="border-b last:border-0">
                    <td className="py-2 pr-3">{month.label}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {money(month.charge)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {money(month.applied)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {money(month.balance)}
                    </td>
                    <td className="py-2">{coverageLabel[month.coverage]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canCollect ? (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={async (event) => {
              event.preventDefault();
              const parsed = Number(amount);
              if (!Number.isFinite(parsed) || parsed <= 0) {
                toast.error("Enter an amount greater than 0");
                return;
              }
              setSaving(true);
              try {
                await onCollect(parsed);
                setAmount("");
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="grid flex-1 gap-2">
              <Label htmlFor={`${title}-amount`}>Amount</Label>
              <Input
                id={`${title}-amount`}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Any amount"
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : collectLabel}
            </Button>
          </form>
        ) : null}
        {payments.length > 0 ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Payments</p>
            {payments.map((payment) => (
              <p key={payment.id} className="text-muted-foreground">
                {payment.paidOn}: {money(payment.amount)}
                {payment.note ? ` · ${payment.note}` : ""}
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatementView({
  statement,
  canCollect,
  asOf,
}: {
  statement: Statement;
  canCollect: boolean;
  asOf: string;
}) {
  const recordSettlement = useMutation(api.fees.recordSettlement);
  const transportDescription = statement.transportAssigned
    ? `${statement.transportRouteName ?? "Assigned route"}. Charged only from ${statement.transportFromMonth ?? "the assignment"} onward. Extra payment stays as advance and covers later months.`
    : "This student is not assigned to transport, so no transport fee is charged.";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">
          {statement.studentName}{" "}
          <span className="text-muted-foreground">
            {statement.admissionNumber}
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">
          {statement.classLabel} · {statement.year}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <FeePanel
          title="Academic fee"
          description="Charged for every month of the year, including months before admission. A larger payment becomes advance and is used on later months."
          account={statement.academic}
          earlierPayments={statement.academicEarlierPayments}
          payments={statement.academicPayments}
          canCollect={canCollect}
          collectLabel="Collect academic fee"
          onCollect={async (amount) => {
            try {
              await recordSettlement({
                studentId: statement.studentId,
                kind: "academic",
                amount,
                paidOn: asOf,
              });
              toast.success("Academic fee recorded");
            } catch (error) {
              toast.error(mutationResult(error).message);
              throw error;
            }
          }}
        />
        <FeePanel
          title="Transport fee"
          description={transportDescription}
          account={statement.transport}
          payments={statement.transportPayments}
          canCollect={canCollect && statement.transportAssigned}
          collectLabel="Collect transport fee"
          onCollect={async (amount) => {
            try {
              await recordSettlement({
                studentId: statement.studentId,
                kind: "transport",
                amount,
                paidOn: asOf,
              });
              toast.success("Transport fee recorded");
            } catch (error) {
              toast.error(mutationResult(error).message);
              throw error;
            }
          }}
        />
      </div>
    </div>
  );
}

export default function FeesPage() {
  const me = useQuery(api.users.me);
  const [asOf] = useState(todayIso);
  const [term, setTerm] = useState("");
  const [studentId, setStudentId] = useState<Id<"students"> | null>(null);
  const trimmed = term.trim();
  const isAdmin = me?.role === "super_admin";
  const matches = useQuery(
    api.fees.searchStudents,
    isAdmin && trimmed.length >= 1 ? { term: trimmed } : "skip",
  );
  const statement = useQuery(
    api.fees.statement,
    isAdmin && studentId ? { studentId, asOf } : "skip",
  );
  const mine = useQuery(
    api.fees.myStatements,
    me && !isAdmin && (me.role === "parent" || me.role === "student")
      ? { asOf }
      : "skip",
  );

  useEffect(() => {
    if (!matches) {
      return;
    }
    if (matches.length === 1) {
      setStudentId(matches[0].studentId);
      return;
    }
    if (
      studentId &&
      !matches.some((match) => match.studentId === studentId)
    ) {
      setStudentId(null);
    }
  }, [matches, studentId]);

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading fees…</p>;
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fees</h1>
          <p className="text-sm text-muted-foreground">
            Academic fees and transport fees for this year.
          </p>
        </div>
        {mine === undefined ? (
          <p className="text-sm text-muted-foreground">Loading fees…</p>
        ) : mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No student record is linked to this account.
          </p>
        ) : (
          mine.map((item) => (
            <StatementView
              key={item.studentId}
              statement={item}
              canCollect={false}
              asOf={asOf}
            />
          ))
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fees</h1>
        <p className="text-sm text-muted-foreground">
          Search a student by name or admission number, then collect academic
          fees and transport fees separately.
        </p>
      </div>

      <div className="grid max-w-xl gap-2">
        <Label htmlFor="fee-search">Student</Label>
        <Input
          id="fee-search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Name or admission number"
          autoComplete="off"
        />
      </div>

      {trimmed.length >= 1 && matches === undefined ? (
        <p className="text-sm text-muted-foreground">Searching…</p>
      ) : null}
      {matches && matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching student.</p>
      ) : null}
      {matches && matches.length > 1 ? (
        <div className="flex flex-col gap-2">
          {matches.map((match) => (
            <button
              key={match.studentId}
              type="button"
              className="rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => setStudentId(match.studentId)}
            >
              <span className="font-medium">{match.studentName}</span>
              <span className="text-muted-foreground">
                {" "}
                · {match.admissionNumber} · {match.classLabel}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {studentId && statement === undefined ? (
        <p className="text-sm text-muted-foreground">Loading fees…</p>
      ) : null}
      {statement ? (
        <StatementView statement={statement} canCollect asOf={asOf} />
      ) : null}
    </div>
  );
}
