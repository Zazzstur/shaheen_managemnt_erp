"use client";

import { useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MAX_AMOUNT = 10_000_000;
const MAX_DESCRIPTION = 200;

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

export default function ExpensesPage() {
  const me = useQuery(api.users.me);
  const allowed = me ? canViewSchoolAdmin(me) : false;
  const canEdit = me ? isSchoolAdmin(me) : false;
  const expenses = useQuery(api.expenses.list, allowed ? {} : "skip");
  const createExpense = useMutation(api.expenses.create);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSave(event?: React.FormEvent) {
    event?.preventDefault();
    if (saving) {
      return;
    }
    const parsed = parseAmount(amount);
    const text = description.trim();
    if (parsed === null) {
      toast.error(
        "Enter an amount greater than 0, up to 10,000,000, with at most 2 decimal places",
      );
      return;
    }
    if (!text) {
      toast.error("Enter a description");
      return;
    }
    if (text.length > MAX_DESCRIPTION) {
      toast.error("Description is too long");
      return;
    }
    setSaving(true);
    try {
      await createExpense({ amount: parsed, description: text });
      toast.success("Expense recorded");
      setAmount("");
      setDescription("");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  if (me === undefined || (allowed && expenses === undefined)) {
    return <p className="text-sm text-muted-foreground">Loading expenses…</p>;
  }
  if (me === null) {
    return (
      <p className="text-sm text-destructive">
        Your account is not available. Sign in again.
      </p>
    );
  }
  if (!allowed || expenses === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        Only super admins and data entry can record expenses.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-muted-foreground">
          Record an office expense. It is dated today and shown on the
          dashboard.
        </p>
      </div>

      {canEdit ? (
      <Card>
        <CardHeader>
          <CardTitle>Record expense</CardTitle>
          <CardDescription>Amount in rupees, and what it was for.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void onSave(event)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expense-amount">Amount (₹)</Label>
                <Input
                  id="expense-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense-description">Description</Label>
                <Input
                  id="expense-description"
                  value={description}
                  maxLength={MAX_DESCRIPTION}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Record expense"}
            </Button>
          </form>
        </CardContent>
      </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Read-only. Observers cannot record expenses.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recorded expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No expenses recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>{formatDay(expense.date)}</TableCell>
                    <TableCell className="font-medium">
                      {expense.description}
                    </TableCell>
                    <TableCell>{money(expense.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
