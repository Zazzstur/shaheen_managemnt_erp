"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { canViewSchoolAdmin, isSchoolAdmin } from "@/lib/access";
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

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
};

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function classLabel(classroom: { name: string; section: string }) {
  return `${classroom.name} ${classroom.section}`.trim();
}

function statusClass(status: AttendanceStatus | null) {
  if (status === "present") {
    return "text-green-700";
  }
  if (status === "absent") {
    return "text-red-700";
  }
  if (status === "late") {
    return "text-amber-700";
  }
  return "text-muted-foreground";
}

function NameList({
  title,
  names,
  empty,
}: {
  title: string;
  names: string[];
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">
        {title}
        <span className="ml-2 text-muted-foreground">{names.length}</span>
      </h3>
      {names.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {names.map((name, index) => (
            <li key={`${name}-${index}`}>{name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function StudentAttendancePage() {
  const me = useQuery(api.users.me);
  const canView = me ? canViewSchoolAdmin(me) : false;
  const canEdit = me ? isSchoolAdmin(me) : false;
  const classes = useQuery(api.catalog.listClasses, canView ? {} : "skip");
  const [date, setDate] = useState(todayIso);
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const [editing, setEditing] = useState(false);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const sheet = useQuery(
    api.attendance.forClassDate,
    classId ? { classId, date } : "skip",
  );
  const markForOffice = useMutation(api.attendance.markForOffice);

  const sortedClasses = useMemo(() => {
    return [...(classes ?? [])].sort((a, b) =>
      classLabel(a).localeCompare(classLabel(b)),
    );
  }, [classes]);

  useEffect(() => {
    if (!classId && sortedClasses.length > 0) {
      setClassId(sortedClasses[0]._id);
    }
  }, [classId, sortedClasses]);

  const classItems = Object.fromEntries(
    sortedClasses.map((classroom) => [classroom._id, classLabel(classroom)]),
  );

  const students = sheet?.students ?? [];
  const present = students.filter((student) => student.status === "present");
  const absent = students.filter((student) => student.status === "absent");
  const late = students.filter((student) => student.status === "late");
  const unmarked = students.filter((student) => student.status === null);

  function startEdit() {
    setMarks({});
    setEditing(true);
  }

  function cancelEdit() {
    setMarks({});
    setEditing(false);
  }

  async function save() {
    if (!classId || !sheet) {
      return;
    }
    setSaving(true);
    try {
      const result = await markForOffice({
        classId,
        date,
        records: sheet.students.map((student) => ({
          studentId: student.studentId,
          status: marks[student.studentId] ?? student.status ?? "present",
        })),
      });
      setMarks({});
      setEditing(false);
      toast.success(`Saved attendance for ${result.saved} students`);
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading attendance…</p>;
  }
  if (me === null || !canView) {
    return (
      <p className="text-sm text-muted-foreground">
        Only the office can open class attendance.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          See who is present and absent in a class. Edit the marks, or mark the
          class when the class teacher is absent.
        </p>
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Class attendance</CardTitle>
            <CardDescription>
              {sheet
                ? sheet.classTeacherName === "No class teacher"
                  ? "No class teacher is assigned."
                  : `${sheet.classTeacherName} is the class teacher.`
                : "Choose a date and a class."}
            </CardDescription>
          </div>
          {canEdit && sheet && sheet.students.length > 0 ? (
            editing ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={cancelEdit}
                >
                  Cancel
                </Button>
                <Button type="button" disabled={saving} onClick={() => void save()}>
                  {saving ? "Saving…" : "Save attendance"}
                </Button>
              </div>
            ) : (
              <Button type="button" onClick={startEdit}>
                Edit attendance
              </Button>
            )
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="student-attendance-date">Date</Label>
              <Input
                id="student-attendance-date"
                type="date"
                value={date}
                onChange={(event) => {
                  if (!event.target.value) {
                    return;
                  }
                  setDate(event.target.value);
                  setMarks({});
                  setEditing(false);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              {classes === undefined ? (
                <p className="text-sm text-muted-foreground">Loading classes…</p>
              ) : sortedClasses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No classes yet.</p>
              ) : (
                <Select
                  value={classId}
                  items={classItems}
                  onValueChange={(value) => {
                    if (!value) {
                      return;
                    }
                    setClassId(value as Id<"classes">);
                    setMarks({});
                    setEditing(false);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedClasses.map((classroom) => (
                      <SelectItem key={classroom._id} value={classroom._id}>
                        {classLabel(classroom)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {sheet?.classTeacherAbsent ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The class teacher is absent on this date. You can mark attendance
              for the class.
            </p>
          ) : null}

          {!classId ? (
            <p className="text-sm text-muted-foreground">
              Choose a class to see attendance.
            </p>
          ) : sheet === undefined ? (
            <p className="text-sm text-muted-foreground">Loading attendance…</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No enrolled students in this class.
            </p>
          ) : editing ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => {
                  const current =
                    marks[student.studentId] ?? student.status ?? "present";
                  return (
                    <TableRow key={student.studentId}>
                      <TableCell>{student.admissionNumber}</TableCell>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>
                        <Select
                          value={current}
                          items={STATUS_LABEL}
                          onValueChange={(value) => {
                            if (
                              value === "present" ||
                              value === "absent" ||
                              value === "late"
                            ) {
                              setMarks((existing) => ({
                                ...existing,
                                [student.studentId]: value,
                              }));
                            }
                          }}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                            <SelectItem value="late">Late</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                {present.length} present, {absent.length} absent
                {late.length > 0 ? `, ${late.length} late` : ""}
                {unmarked.length > 0 ? `, ${unmarked.length} not marked` : ""}
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                <NameList
                  title="Present"
                  names={present.map((student) => student.name)}
                  empty="No one is marked present."
                />
                <NameList
                  title="Absent"
                  names={absent.map((student) => student.name)}
                  empty="No one is marked absent."
                />
              </div>
              {late.length > 0 ? (
                <NameList
                  title="Late"
                  names={late.map((student) => student.name)}
                  empty=""
                />
              ) : null}
              {unmarked.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">
                    Not marked
                    <span className="ml-2 text-muted-foreground">
                      {unmarked.length}
                    </span>
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {unmarked.map((student) => (
                      <li key={student.studentId} className={statusClass(null)}>
                        {student.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
