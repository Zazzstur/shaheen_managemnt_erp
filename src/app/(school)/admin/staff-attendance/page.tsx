"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { canViewSchoolAdmin, isSchoolAdmin } from "@/lib/access";
import { mutationResult } from "@/lib/result";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AttendanceStatus = "present" | "absent" | "late";

function attendanceStatusTriggerClass(status: AttendanceStatus) {
  if (status === "present") {
    return "border-green-200 bg-green-50 text-green-700 hover:bg-green-50 dark:border-green-800 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-950 [&_svg]:text-green-700 dark:[&_svg]:text-green-300";
  }
  if (status === "absent") {
    return "border-red-200 bg-red-50 text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-950 [&_svg]:text-red-700 dark:[&_svg]:text-red-300";
  }
  return undefined;
}

const PRESENT_ITEM_CLASS =
  "text-green-700 focus:bg-green-50 focus:text-green-700";
const ABSENT_ITEM_CLASS = "text-red-700 focus:bg-red-50 focus:text-red-700";

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatAbsentDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function AttendanceLog({
  open,
  month,
  onMonthChange,
  onOpenChange,
}: {
  open: boolean;
  month: string;
  onMonthChange: (month: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const rows = useQuery(
    api.staffAttendance.forMonth,
    open ? { month } : "skip",
  );
  const [search, setSearch] = useState("");
  const marked = rows?.some(
    (row) => row.present + row.absent + row.late > 0,
  );
  const visible = useMemo(() => {
    if (!rows) {
      return [];
    }
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter((row) =>
      [row.name, row.email, row.roleLabel]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [rows, search]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSearch("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-hidden rounded-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Attendance log</DialogTitle>
          <DialogDescription>
            Saved attendance for the month. Absent days are the dates marked
            absent.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="attendance-log-month">Month</Label>
            <Input
              id="attendance-log-month"
              type="month"
              className="w-48"
              value={month}
              onChange={(event) => {
                if (event.target.value) {
                  onMonthChange(event.target.value);
                }
              }}
            />
          </div>
          <div className="w-full max-w-sm space-y-2">
            <Label htmlFor="attendance-log-search">Search staff</Label>
            <Input
              id="attendance-log-search"
              value={search}
              placeholder="Name, email, or role"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
        {rows === undefined ? (
          <p className="text-sm text-muted-foreground">Loading attendance log…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff found.</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching staff.</p>
        ) : (
          <>
          {!marked ? (
            <p className="text-sm text-muted-foreground">
              No attendance has been saved for this month.
            </p>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Present</TableHead>
                <TableHead>Late</TableHead>
                <TableHead>Absent</TableHead>
                <TableHead>Absent days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <TableRow key={row.teacherId}>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    {row.email ? (
                      <div className="text-xs text-muted-foreground">
                        {row.email}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.roleLabel}</TableCell>
                  <TableCell>{row.present}</TableCell>
                  <TableCell>{row.late}</TableCell>
                  <TableCell>{row.absent}</TableCell>
                  <TableCell className="whitespace-normal">
                    {row.absentDates.length > 0
                      ? row.absentDates.map(formatAbsentDay).join(", ")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_LABEL = {
  present: "Present",
  absent: "Absent",
  late: "Late",
} as const;

function StaffRoster({
  date,
  rows,
  readOnly = false,
}: {
  date: string;
  readOnly?: boolean;
  rows: {
    teacherId: Id<"users">;
    name: string;
    email?: string;
    roleLabel: string;
    status: AttendanceStatus;
  }[];
}) {
  const save = useMutation(api.staffAttendance.save);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusById, setStatusById] = useState<Record<string, AttendanceStatus>>(
    () => Object.fromEntries(rows.map((row) => [row.teacherId, row.status])),
  );
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter((row) =>
      [row.name, row.email, row.roleLabel]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [rows, search]);

  async function onSave() {
    setSaving(true);
    try {
      await save({
        date,
        rows: rows.map((row) => ({
          teacherId: row.teacherId,
          status: statusById[row.teacherId] ?? row.status,
        })),
      });
      toast.success("Staff attendance saved");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff</CardTitle>
        <CardDescription>
          Absent staff leave their classes free. Late staff stay on their own
          periods.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full max-w-sm space-y-2">
            <Label htmlFor="staff-search">Search staff</Label>
            <Input
              id="staff-search"
              value={search}
              placeholder="Name or role"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {readOnly ? (
            <p className="text-sm text-muted-foreground">
              Read-only. Observers cannot mark attendance.
            </p>
          ) : (
          <Button type="button" disabled={saving || rows.length === 0} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Save attendance"}
          </Button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff found.</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching staff.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const status = statusById[row.teacherId] ?? row.status;
                return (
                  <TableRow key={row.teacherId}>
                    <TableCell>
                      <div className="font-medium">{row.name}</div>
                      {row.email &&
                      row.email.localeCompare(row.name, undefined, {
                        sensitivity: "accent",
                      }) !== 0 ? (
                        <div className="text-xs text-muted-foreground">
                          {row.email}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.roleLabel}</TableCell>
                    <TableCell>
                      <Select
                        value={status}
                        disabled={readOnly}
                        items={STATUS_LABEL}
                        onValueChange={(next) => {
                          if (
                            next === "present" ||
                            next === "absent" ||
                            next === "late"
                          ) {
                            setStatusById((current) => ({
                              ...current,
                              [row.teacherId]: next,
                            }));
                          }
                        }}
                      >
                        <SelectTrigger
                          className={`w-36 ${attendanceStatusTriggerClass(status) ?? ""}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="present" className={PRESENT_ITEM_CLASS}>
                            Present
                          </SelectItem>
                          <SelectItem value="absent" className={ABSENT_ITEM_CLASS}>
                            Absent
                          </SelectItem>
                          <SelectItem value="late">Late</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function StaffAttendancePage() {
  const me = useQuery(api.users.me);
  const [date, setDate] = useState(todayIso);
  const [logOpen, setLogOpen] = useState(false);
  const [logMonth, setLogMonth] = useState(() => todayIso().slice(0, 7));
  const allowed = me ? canViewSchoolAdmin(me) : false;
  const canEdit = me ? isSchoolAdmin(me) : false;
  const rows = useQuery(
    api.staffAttendance.forDate,
    allowed ? { date } : "skip",
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Staff attendance
          </h1>
          <p className="text-sm text-muted-foreground">
            Mark who is present, absent, or late. Free classes uses the absent
            list for this date.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="staff-attendance-date">Date</Label>
            <Input
              id="staff-attendance-date"
              type="date"
              value={date}
              onChange={(event) => {
                if (event.target.value) {
                  setDate(event.target.value);
                }
              }}
            />
          </div>
          {allowed ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLogMonth(date.slice(0, 7));
                setLogOpen(true);
              }}
            >
              Attendance log
            </Button>
          ) : null}
        </div>
      </div>
      {me === undefined || (allowed && rows === undefined) ? (
        <p className="text-sm text-muted-foreground">Loading staff attendance…</p>
      ) : me === null ? (
        <p className="text-sm text-destructive">
          Your account is not available. Sign in again.
        </p>
      ) : !allowed ? (
        <p className="text-sm text-muted-foreground">
          Only super admins and data entry can mark staff attendance.
        </p>
      ) : rows ? (
        <StaffRoster key={date} date={date} rows={rows} readOnly={!canEdit} />
      ) : null}
      {allowed ? (
        <AttendanceLog
          open={logOpen}
          month={logMonth}
          onMonthChange={setLogMonth}
          onOpenChange={setLogOpen}
        />
      ) : null}
    </div>
  );
}
