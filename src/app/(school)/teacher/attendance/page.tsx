"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
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

const SUBMISSION_LABEL = {
  submitted: "Submitted",
  partial: "Partial",
  missing: "Not submitted",
} as const;

function attendanceSummary(row: {
  presentCount: number;
  absentCount: number;
  lateCount: number;
  markedCount: number;
  enrolledCount: number;
}) {
  if (row.markedCount === 0) {
    return `0/${row.enrolledCount}`;
  }
  const parts = [`${row.presentCount} present`];
  if (row.absentCount > 0) {
    parts.push(`${row.absentCount} absent`);
  }
  if (row.lateCount > 0) {
    parts.push(`${row.lateCount} late`);
  }
  const unmarked = row.enrolledCount - row.markedCount;
  if (unmarked > 0) {
    parts.push(`${unmarked} not marked`);
  }
  return parts.join(", ");
}

function InchargeAttendance() {
  const [date, setDate] = useState(todayIso);
  const rows = useQuery(api.attendance.submissionForDate, { date });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            See which of your classes have submitted attendance.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="attendance-review-date">Date</Label>
          <Input
            id="attendance-review-date"
            type="date"
            value={date}
            onChange={(event) => {
              if (event.target.value) {
                setDate(event.target.value);
              }
            }}
          />
        </div>
      </div>
      {rows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading attendance…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No classes are assigned to you yet.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Class attendance</CardTitle>
            <CardDescription>
              Submitted means every student has a saved mark. The counts show
              how many are present, absent, or late.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Class teacher</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.classId}>
                    <TableCell>{row.classLabel}</TableCell>
                    <TableCell>{row.classTeacherName}</TableCell>
                    <TableCell>{attendanceSummary(row)}</TableCell>
                    <TableCell>{SUBMISSION_LABEL[row.status]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ClassTeacherAttendance() {
  const me = useQuery(api.users.me);
  const classes = useQuery(
    api.catalog.listClasses,
    me?.staffRole === "class_teacher" && me.classId ? {} : "skip",
  );
  const classId = me?.staffRole === "class_teacher" ? me.classId : undefined;
  const assignedClass = (classes ?? []).find((classroom) => classroom._id === classId);
  const [date, setDate] = useState(todayIso);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const roster = useQuery(
    api.attendance.rosterForClassDate,
    classId ? { classId, date } : "skip",
  );
  const markBatch = useMutation(api.attendance.markBatch);
  const [saving, setSaving] = useState(false);

  const merged = useMemo(() => {
    if (!roster) return [];
    return roster.map((row) => ({
      ...row,
      current: marks[row.studentId] ?? row.status ?? "present",
    }));
  }, [roster, marks]);

  const save = async () => {
    if (!classId) {
      toast.error("No class is assigned to this login");
      return;
    }
    setSaving(true);
    try {
      const result = await markBatch({
        classId,
        date,
        records: merged.map((row) => ({
          studentId: row.studentId,
          status: row.current,
        })),
      });
      toast.success(`Saved attendance for ${result.saved} students`);
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  };

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading attendance…</p>;
  }
  if (me === null || me.staffRole !== "class_teacher") {
    return (
      <p className="text-sm text-muted-foreground">
        Only a class teacher can take attendance.
      </p>
    );
  }
  if (!classId) {
    return (
      <p className="text-sm text-muted-foreground">
        No class is assigned to this class teacher yet.
      </p>
    );
  }

  const classLabel = assignedClass
    ? `${assignedClass.name} ${assignedClass.section}`.trim()
    : "Assigned class";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Mark present, absent, or late for {classLabel}.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Class roster</CardTitle>
          <CardDescription>
            Attendance is saved for {classLabel} only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Class</Label>
              <p className="flex h-8 items-center text-sm font-medium">
                {classLabel}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setMarks({});
                }}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={() => void save()} disabled={saving || !classId}>
                {saving ? "Saving…" : "Save attendance"}
              </Button>
            </div>
          </div>

          {!classId ? (
            <p className="text-sm text-muted-foreground">
              Choose a class to load students.
            </p>
          ) : roster === undefined ? (
            <p className="text-sm text-muted-foreground">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No enrolled students in this class.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {merged.map((row) => (
                  <TableRow key={row.studentId}>
                    <TableCell>{row.admissionNumber}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>
                      <Select
                        value={row.current}
                        items={{
                          present: "Present",
                          absent: "Absent",
                          late: "Late",
                        }}
                        onValueChange={(value) => {
                          if (
                            value === "present" ||
                            value === "absent" ||
                            value === "late"
                          ) {
                            setMarks((current) => ({
                              ...current,
                              [row.studentId]: value,
                            }));
                          }
                        }}
                      >
                        <SelectTrigger
                          className={`w-40 ${attendanceStatusTriggerClass(row.current) ?? ""}`}
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AttendancePage() {
  const me = useQuery(api.users.me);
  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading attendance…</p>;
  }
  if (me?.staffRole === "incharge") {
    return <InchargeAttendance />;
  }
  return <ClassTeacherAttendance />;
}
