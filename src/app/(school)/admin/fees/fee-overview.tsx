"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function yearStart(iso: string) {
  return `${iso.slice(0, 4)}-01-01`;
}

function monthTitle(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  if (!year || !month) {
    return iso;
  }
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

const kindLabel = {
  academic: "Academic",
  transport: "Transport",
} as const;

const modeLabel = {
  cash: "Cash",
  online: "Online",
} as const;

function classLabel(name: string, section: string) {
  return `${name} ${section}`.trim();
}

function ReportFilters({
  idPrefix,
  from,
  to,
  classId,
  classes,
  onFrom,
  onTo,
  onClassId,
}: {
  idPrefix: string;
  from: string;
  to: string;
  classId: string;
  classes: Array<{ _id: Id<"classes">; name: string; section: string }>;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onClassId: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-from`}>From</Label>
        <Input
          id={`${idPrefix}-from`}
          type="date"
          value={from}
          max={to}
          onChange={(event) => {
            if (event.target.value) {
              onFrom(event.target.value);
            }
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-to`}>To</Label>
        <Input
          id={`${idPrefix}-to`}
          type="date"
          value={to}
          min={from}
          onChange={(event) => {
            if (event.target.value) {
              onTo(event.target.value);
            }
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-class`}>Class</Label>
        <select
          id={`${idPrefix}-class`}
          value={classId}
          onChange={(event) => onClassId(event.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="">All classes</option>
          {classes.map((classroom) => (
            <option key={classroom._id} value={classroom._id}>
              {classLabel(classroom.name, classroom.section)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function FeeOverview({ asOf }: { asOf: string }) {
  const [screen, setScreen] = useState<"collection" | "due" | null>(null);
  const [collectionFrom, setCollectionFrom] = useState(monthStart(asOf));
  const [collectionTo, setCollectionTo] = useState(asOf);
  const [dueFrom, setDueFrom] = useState(yearStart(asOf));
  const [dueTo, setDueTo] = useState(asOf);
  const [collectionClassId, setCollectionClassId] = useState("");
  const [dueClassId, setDueClassId] = useState("");

  const classes = useQuery(api.catalog.listClasses, {});
  const snapshot = useQuery(api.fees.schoolSnapshot, {
    asOf,
    collectionFrom: monthStart(asOf),
    collectionTo: asOf,
  });
  const collection = useQuery(
    api.fees.collectionReport,
    screen === "collection"
      ? {
          from: collectionFrom,
          to: collectionTo,
          ...(collectionClassId
            ? { classId: collectionClassId as Id<"classes"> }
            : {}),
        }
      : "skip",
  );
  const dues = useQuery(
    api.fees.dueReport,
    screen === "due"
      ? {
          from: dueFrom,
          to: dueTo,
          ...(dueClassId ? { classId: dueClassId as Id<"classes"> } : {}),
        }
      : "skip",
  );

  const classRows = classes ?? [];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="rounded-xl text-left ring-foreground/10 outline-none hover:bg-muted/40 focus-visible:ring-2"
          onClick={() => setScreen("collection")}
        >
          <Card className="h-full border-transparent shadow-none">
            <CardHeader>
              <CardDescription>Monthly collection</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {snapshot === undefined ? "…" : money(snapshot.monthlyCollection)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {monthTitle(asOf)}
              {snapshot
                ? ` · ${snapshot.paymentCount} payment${snapshot.paymentCount === 1 ? "" : "s"}`
                : ""}
            </CardContent>
          </Card>
        </button>
        <button
          type="button"
          className="rounded-xl text-left ring-foreground/10 outline-none hover:bg-muted/40 focus-visible:ring-2"
          onClick={() => setScreen("due")}
        >
          <Card className="h-full border-transparent shadow-none">
            <CardHeader>
              <CardDescription>Total due</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {snapshot === undefined ? "…" : money(snapshot.totalDue)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {snapshot
                ? `${snapshot.studentsWithDue} student${snapshot.studentsWithDue === 1 ? "" : "s"} with a balance`
                : "All students, through today"}
            </CardContent>
          </Card>
        </button>
      </div>

      <Dialog
        open={screen === "collection"}
        onOpenChange={(open) => {
          if (!open) {
            setScreen(null);
          }
        }}
      >
        <DialogContent className="inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-hidden rounded-none sm:max-w-none">
          <DialogHeader>
            <DialogTitle>Monthly collection</DialogTitle>
            <DialogDescription>
              Payments recorded in this date range
              {collection ? ` · ${money(collection.total)}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <ReportFilters
            idPrefix="collection"
            from={collectionFrom}
            to={collectionTo}
            classId={collectionClassId}
            classes={classRows}
            onFrom={setCollectionFrom}
            onTo={setCollectionTo}
            onClassId={setCollectionClassId}
          />
          <div className="min-h-0 flex-1 overflow-auto">
            {collection === undefined ? (
              <p className="text-sm text-muted-foreground">Loading payments…</p>
            ) : collection.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payments in this range.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-popover">
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Student</th>
                    <th className="py-2 pr-3 font-medium">Class</th>
                    <th className="py-2 pr-3 font-medium">Fee</th>
                    <th className="py-2 pr-3 font-medium">Mode</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {collection.rows.map((row) => (
                    <tr key={row.paymentId} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{row.paidOn}</td>
                      <td className="py-2 pr-3">
                        <span className="font-medium">{row.studentName}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          {row.admissionNumber}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{row.classLabel}</td>
                      <td className="py-2 pr-3">{kindLabel[row.kind]}</td>
                      <td className="py-2 pr-3">
                        {row.mode ? modeLabel[row.mode] : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {money(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <Button type="button" variant="outline" onClick={() => setScreen(null)}>
            Close
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={screen === "due"}
        onOpenChange={(open) => {
          if (!open) {
            setScreen(null);
          }
        }}
      >
        <DialogContent className="inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-hidden rounded-none sm:max-w-none">
          <DialogHeader>
            <DialogTitle>Fees due</DialogTitle>
            <DialogDescription>
              Outstanding academic and transport fees for months in this range
              {dues ? ` · ${money(dues.totalDue)}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <ReportFilters
            idPrefix="due"
            from={dueFrom}
            to={dueTo}
            classId={dueClassId}
            classes={classRows}
            onFrom={setDueFrom}
            onTo={setDueTo}
            onClassId={setDueClassId}
          />
          <div className="min-h-0 flex-1 overflow-auto">
            {dues === undefined ? (
              <p className="text-sm text-muted-foreground">Loading dues…</p>
            ) : dues.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No students have a balance in this range.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-popover">
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-medium">Student</th>
                    <th className="py-2 pr-3 font-medium">Father's number</th>
                    <th className="py-2 pr-3 font-medium">Mother's number</th>
                    <th className="py-2 pr-3 font-medium">Class</th>
                    <th className="py-2 pr-3 text-right font-medium">Academic</th>
                    <th className="py-2 pr-3 text-right font-medium">Transport</th>
                    <th className="py-2 text-right font-medium">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {dues.rows.map((row) => (
                    <tr key={row.studentId} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{row.studentName}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          {row.admissionNumber}
                        </span>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {row.fatherPhone ?? "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {row.motherPhone ?? "—"}
                      </td>
                      <td className="py-2 pr-3">{row.classLabel}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {money(row.academicDue)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {money(row.transportDue)}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {money(row.due)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <Button type="button" variant="outline" onClick={() => setScreen(null)}>
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
