"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { StockGate, StockTabs } from "@/components/stock-frame";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function IssueList({ mode }: { mode: "give" | "lend" }) {
  const rows = useQuery(api.stock.issues, { mode });
  const returnLent = useMutation(api.stock.returnLent);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [returningId, setReturningId] = useState("");
  const lent = mode === "lend";

  async function onReturn(issueId: Id<"stockIssues">, outstanding: number) {
    const amount = Number(amounts[issueId] || outstanding);
    if (!Number.isInteger(amount) || amount < 1) {
      toast.error("Enter a whole quantity to return");
      return;
    }
    setReturningId(issueId);
    try {
      await returnLent({ issueId, quantity: amount });
      toast.success("Item returned");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setReturningId("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {lent ? "Lent stock" : "Given stock"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lent
              ? "Items that were lent and are expected back."
              : "Items that were given and are not returned."}
          </p>
        </div>
        <StockTabs />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{lent ? "Loans" : "Gifts"}</CardTitle>
          <CardDescription>
            {lent
              ? "Return removes it from the person who has it and puts it back with the person who lent it."
              : "Given items stay with the person who received them."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows === undefined ? (
            <p className="text-sm text-muted-foreground">Loading records…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {lent ? "Nothing is on loan." : "Nothing has been given."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Quantity</TableHead>
                  {lent ? <TableHead>Still out</TableHead> : null}
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  {lent ? <TableHead>Return</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.issueId}>
                    <TableCell>{formatDay(row.date)}</TableCell>
                    <TableCell className="font-medium">
                      {row.itemName}
                      {row.note ? (
                        <div className="text-xs text-muted-foreground">{row.note}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.quantity}</TableCell>
                    {lent ? <TableCell>{row.outstanding}</TableCell> : null}
                    <TableCell>{row.fromName}</TableCell>
                    <TableCell>{row.toName}</TableCell>
                    {lent ? (
                      <TableCell>
                        {row.canReturn ? (
                          <div className="flex items-center gap-2">
                            <Input
                              className="w-20"
                              inputMode="numeric"
                              aria-label={`Return quantity for ${row.itemName}`}
                              value={amounts[row.issueId] ?? String(row.outstanding)}
                              onChange={(event) =>
                                setAmounts((current) => ({
                                  ...current,
                                  [row.issueId]: event.target.value,
                                }))
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={returningId === row.issueId}
                              onClick={() =>
                                void onReturn(row.issueId, row.outstanding)
                              }
                            >
                              {returningId === row.issueId ? "Returning…" : "Return"}
                            </Button>
                          </div>
                        ) : (
                          "Returned"
                        )}
                      </TableCell>
                    ) : null}
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

export function StockIssuePage({ mode }: { mode: "give" | "lend" }) {
  return (
    <StockGate>
      <IssueList mode={mode} />
    </StockGate>
  );
}
