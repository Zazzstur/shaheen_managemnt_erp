"use client";

import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MAX_MARKS = 20;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
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
];
function previousTestMonth(now = Date.now()) {
  const ist = new Date(now + IST_OFFSET_MS);
  const shifted = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

function shiftMonth(year: number, month: number, delta: number) {
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthIndex(year: number, month: number) {
  return year * 12 + (month - 1);
}

function monthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function formatMonthKey(month: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) {
    return month;
  }
  return monthLabel(Number(match[1]), Number(match[2]));
}

function formatStored(value: number | "AB" | null) {
  if (value === null) {
    return "—";
  }
  if (value === "AB") {
    return "AB";
  }
  return Number.isInteger(value) ? String(value) : String(value);
}

function markWithinMax(value: string, max: number) {
  if (value === "") {
    return true;
  }
  if (/^a$/i.test(value) || /^ab$/i.test(value)) {
    return true;
  }
  if (!/^\d*\.?\d*$/.test(value)) {
    return false;
  }
  const numeric = value.endsWith(".") ? value.slice(0, -1) : value;
  const number = Number(numeric === "" ? "0" : numeric);
  return Number.isFinite(number) && number >= 0 && number <= max;
}

type ParsedMark =
  | { state: "empty" }
  | { state: "absent" }
  | { state: "value"; value: number }
  | { state: "invalid" };

function parseMarkField(raw: string, max: number): ParsedMark {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { state: "empty" };
  }
  if (/^ab$/i.test(trimmed)) {
    return { state: "absent" };
  }
  if (!/^\d*\.?\d*$/.test(trimmed)) {
    return { state: "invalid" };
  }
  const numeric = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  if (numeric === "") {
    return { state: "invalid" };
  }
  const value = Number(numeric);
  if (!Number.isFinite(value) || value < 0 || value > max) {
    return { state: "invalid" };
  }
  return { state: "value", value };
}

function storedMark(parsed: ParsedMark): number | "AB" {
  if (parsed.state === "absent") {
    return "AB";
  }
  if (parsed.state === "value") {
    return parsed.value;
  }
  return 0;
}

function normalizeDraft(value: string) {
  if (/^ab$/i.test(value)) {
    return "AB";
  }
  if (/^a$/i.test(value)) {
    return "A";
  }
  return value;
}

function MonthPicker({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (next: { year: number; month: number }) => void;
}) {
  const latest = previousTestMonth();
  const earliest = shiftMonth(latest.year, latest.month, -35);
  const atLatest = monthIndex(year, month) >= monthIndex(latest.year, latest.month);
  const atEarliest = monthIndex(year, month) <= monthIndex(earliest.year, earliest.month);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-lg font-semibold tracking-tight" aria-live="polite">
          {monthLabel(year, month)}
        </p>
        <p className="text-xs text-muted-foreground">
          Marks are entered the following month.
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous month"
          disabled={atEarliest}
          onClick={() => onChange(shiftMonth(year, month, -1))}
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next month"
          disabled={atLatest}
          onClick={() => onChange(shiftMonth(year, month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

function MarksEditor({
  classId,
  subjectId,
  month,
  title,
}: {
  classId: Id<"classes">;
  subjectId: Id<"subjects">;
  month: string;
  title: string;
}) {
  const sheet = useQuery(api.monthlyTests.sheet, { classId, subjectId, month });
  const saveMarks = useMutation(api.monthlyTests.save);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [seededKey, setSeededKey] = useState("");
  const [saving, setSaving] = useState(false);
  const rosterKey = sheet?.students.map((student) => student.studentId).join(",") ?? "";
  const formKey = `${classId}:${subjectId}:${month}:${rosterKey}`;
  const scoresReady = sheet !== undefined && seededKey === formKey;
  const maxMarks = sheet?.maxMarks ?? MAX_MARKS;

  useEffect(() => {
    if (!sheet || seededKey === formKey) {
      return;
    }
    const nextScores: Record<string, string> = {};
    for (const student of sheet.students) {
      if (student.marksObtained !== null) {
        nextScores[student.studentId] = String(student.marksObtained);
      }
    }
    setSeededKey(formKey);
    setScores(nextScores);
  }, [sheet, formKey, seededKey]);

  async function onSave() {
    if (!sheet || !scoresReady) {
      return;
    }
    const marks = [];
    for (const student of sheet.students) {
      const raw = (scores[student.studentId] ?? "").trim();
      if (!raw) {
        marks.push({ studentId: student.studentId, cleared: true });
        continue;
      }
      const parsed = parseMarkField(raw, maxMarks);
      if (parsed.state === "invalid" || parsed.state === "empty") {
        toast.error(
          `${student.studentName}: marks must be between 0 and ${maxMarks}, or AB`,
        );
        return;
      }
      marks.push({
        studentId: student.studentId,
        marksObtained: storedMark(parsed),
      });
    }
    setSaving(true);
    try {
      await saveMarks({ classId, subjectId, month, marks });
      toast.success("Marks saved");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  if (sheet === undefined) {
    return <p className="text-sm text-muted-foreground">Loading students…</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {sheet.classLabel} · {sheet.subjectName} · out of {sheet.maxMarks}. Leave
          a box empty to clear it. Type AB for absent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sheet.students.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No enrolled students in this class.
          </p>
        ) : (
          <div className="space-y-4">
            {sheet.students.map((student) => (
              <div
                key={student.studentId}
                className="grid gap-2 border-b pb-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="font-medium">{student.studentName}</p>
                  <p className="text-xs text-muted-foreground">
                    {student.admissionNumber}
                  </p>
                </div>
                <Input
                  inputMode="text"
                  placeholder={`Out of ${sheet.maxMarks}`}
                  aria-label={`${student.studentName} marks`}
                  disabled={!scoresReady}
                  value={scores[student.studentId] ?? ""}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (!markWithinMax(next, sheet.maxMarks)) {
                      return;
                    }
                    setScores((current) => ({
                      ...current,
                      [student.studentId]: normalizeDraft(next),
                    }));
                  }}
                />
              </div>
            ))}
          </div>
        )}
        <Button
          type="button"
          disabled={saving || !scoresReady || sheet.students.length === 0}
          onClick={() => void onSave()}
        >
          {saving ? "Saving…" : "Save marks"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TeacherMonthlyTests() {
  const assignments = useQuery(api.monthlyTests.entryOptions);
  const initial = previousTestMonth();
  const [year, setYear] = useState(initial.year);
  const [monthNumber, setMonthNumber] = useState(initial.month);
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const [subjectId, setSubjectId] = useState<Id<"subjects"> | "">("");
  const month = monthKey(year, monthNumber);
  const classes = useMemo(() => {
    const seen = new Map<string, { classId: Id<"classes">; classLabel: string }>();
    for (const item of assignments ?? []) {
      if (!seen.has(item.classId)) {
        seen.set(item.classId, {
          classId: item.classId,
          classLabel: item.classLabel,
        });
      }
    }
    return [...seen.values()];
  }, [assignments]);
  const subjects = useMemo(() => {
    if (!classId) {
      return [];
    }
    const seen = new Map<string, { subjectId: Id<"subjects">; subjectName: string }>();
    for (const item of assignments ?? []) {
      if (item.classId === classId && !seen.has(item.subjectId)) {
        seen.set(item.subjectId, {
          subjectId: item.subjectId,
          subjectName: item.subjectName,
        });
      }
    }
    return [...seen.values()];
  }, [assignments, classId]);
  const selectedClass = classes.find((item) => item.classId === classId);
  const selectedSubject = subjects.find((item) => item.subjectId === subjectId);

  useEffect(() => {
    if (!assignments) {
      return;
    }
    if (classId && !assignments.some((item) => item.classId === classId)) {
      setClassId("");
      setSubjectId("");
      return;
    }
    if (
      subjectId &&
      !assignments.some(
        (item) => item.classId === classId && item.subjectId === subjectId,
      )
    ) {
      setSubjectId("");
    }
  }, [assignments, classId, subjectId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monthly tests</h1>
        <p className="text-sm text-muted-foreground">
          Choose a class and a subject you teach, then the test month. Enter
          only the subjects you teach. The month starts on last month, because
          those marks are entered the following month.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Test month</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthPicker
              year={year}
              month={monthNumber}
              onChange={(next) => {
                setYear(next.year);
                setMonthNumber(next.month);
              }}
            />
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Class and subject</CardTitle>
              <CardDescription>
                Choose a class, then a subject you teach.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {assignments === undefined ? (
                <p className="text-sm text-muted-foreground">Loading classes…</p>
              ) : assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No subjects are assigned to you on the timetable.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select
                      value={classId || null}
                      items={Object.fromEntries(
                        classes.map((item) => [item.classId, item.classLabel]),
                      )}
                      onValueChange={(value) => {
                        setClassId((value as Id<"classes">) || "");
                        setSubjectId("");
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <span className="truncate">
                          {selectedClass?.classLabel ?? "Select class"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((item) => (
                          <SelectItem key={item.classId} value={item.classId}>
                            {item.classLabel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Select
                      value={subjectId || null}
                      disabled={!classId}
                      items={Object.fromEntries(
                        subjects.map((item) => [item.subjectId, item.subjectName]),
                      )}
                      onValueChange={(value) =>
                        setSubjectId((value as Id<"subjects">) || "")
                      }
                    >
                      <SelectTrigger className="w-full">
                        <span className="truncate">
                          {selectedSubject?.subjectName ?? "Select subject"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map((item) => (
                          <SelectItem key={item.subjectId} value={item.subjectId}>
                            {item.subjectName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          {classId && subjectId && selectedSubject ? (
            <MarksEditor
              key={`${classId}:${subjectId}:${month}`}
              classId={classId}
              subjectId={subjectId}
              month={month}
              title={`${selectedSubject.subjectName} · ${monthLabel(year, monthNumber)}`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

class StudentHistoryErrorBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { message: string | null; resetKey: string }
> {
  state = { message: null as string | null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown) {
    return { message: mutationResult(error).message };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { resetKey: string; message: string | null },
  ) {
    if (props.resetKey !== state.resetKey) {
      return { message: null, resetKey: props.resetKey };
    }
    return null;
  }

  render() {
    if (this.state.message) {
      return (
        <p className="text-sm text-destructive">
          Could not load monthly test history. {this.state.message}
        </p>
      );
    }
    return this.props.children;
  }
}

function StudentHistoryPanel({ studentId }: { studentId: Id<"students"> }) {
  const history = useQuery(api.monthlyTests.studentHistory, { studentId });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{history?.studentName ?? "Monthly test history"}</DialogTitle>
        <DialogDescription>
          {history
            ? `${history.admissionNumber} · every saved monthly test, out of ${history.maxMarks}.`
            : "Every saved monthly test for this student."}
        </DialogDescription>
      </DialogHeader>
      {history === undefined ? (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      ) : history.months.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No monthly test marks saved for this student.
        </p>
      ) : (
        <div className="space-y-6">
          {history.months.map((group) => (
            <div key={group.month} className="space-y-2">
              <h3 className="font-medium">{formatMonthKey(group.month)}</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">
                      Marks (out of {history.maxMarks})
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((row) => (
                    <TableRow
                      key={`${group.month}:${row.classLabel}:${row.subjectName}`}
                    >
                      <TableCell>{row.subjectName}</TableCell>
                      <TableCell>{row.classLabel}</TableCell>
                      <TableCell className="text-right">
                        {formatStored(row.marksObtained)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function StudentHistoryDialog({
  studentId,
  onOpenChange,
}: {
  studentId: Id<"students"> | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={studentId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {studentId ? (
          <StudentHistoryErrorBoundary resetKey={studentId}>
            <StudentHistoryPanel studentId={studentId} />
          </StudentHistoryErrorBoundary>
        ) : (
          <DialogHeader>
            <DialogTitle>Monthly test history</DialogTitle>
            <DialogDescription>
              Every saved monthly test for this student.
            </DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OfficeMonthlyTests({ canEdit }: { canEdit: boolean }) {
  const classes = useQuery(api.monthlyTests.recordClasses);
  const initial = previousTestMonth();
  const [year, setYear] = useState(initial.year);
  const [monthNumber, setMonthNumber] = useState(initial.month);
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const [subjectId, setSubjectId] = useState<Id<"subjects"> | "">("");
  const [search, setSearch] = useState("");
  const [historyStudentId, setHistoryStudentId] = useState<Id<"students"> | null>(
    null,
  );
  const month = monthKey(year, monthNumber);
  const record = useQuery(
    api.monthlyTests.record,
    classId ? { classId, month } : "skip",
  );
  const enterableSubjects = canEdit && record ? record.subjects : [];
  const selectedClass = (classes ?? []).find((item) => item.classId === classId);
  const selectedSubject = enterableSubjects.find((item) => item.subjectId === subjectId);
  const query = search.trim().toLowerCase();
  const students = useMemo(() => {
    if (!record) {
      return [];
    }
    if (!query) {
      return record.students;
    }
    return record.students.filter((student) =>
      [student.studentName, student.admissionNumber].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [record, query]);

  useEffect(() => {
    if (!record || !subjectId) {
      return;
    }
    if (!enterableSubjects.some((item) => item.subjectId === subjectId)) {
      setSubjectId("");
    }
  }, [record, subjectId, enterableSubjects]);

  return (
    <div className="space-y-6">
      <StudentHistoryDialog
        studentId={historyStudentId}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryStudentId(null);
          }
        }}
      />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monthly tests</h1>
        <p className="text-sm text-muted-foreground">
          Record of every student&apos;s monthly test marks. Pick the test month
          and a class.
          {canEdit
            ? " Enter marks for any subject on the class timetable, then review the class record."
            : ""}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Test month</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthPicker
              year={year}
              month={monthNumber}
              onChange={(next) => {
                setYear(next.year);
                setMonthNumber(next.month);
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Class</CardTitle>
            <CardDescription>Students enrolled in the selected class.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {classes === undefined ? (
              <p className="text-sm text-muted-foreground">Loading classes…</p>
            ) : classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classes yet.</p>
            ) : (
              <div className="space-y-2">
                <Label>Class</Label>
                <Select
                  value={classId || null}
                  items={Object.fromEntries(
                    classes.map((item) => [item.classId, item.classLabel]),
                  )}
                  onValueChange={(value) => {
                    setClassId((value as Id<"classes">) || "");
                    setSubjectId("");
                    setSearch("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <span className="truncate">
                      {selectedClass?.classLabel ?? "Select class"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((item) => (
                      <SelectItem key={item.classId} value={item.classId}>
                        {item.classLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {canEdit && record && enterableSubjects.length > 0 ? (
              <div className="space-y-2">
                <Label>Subject to enter</Label>
                <Select
                  value={subjectId || null}
                  items={Object.fromEntries(
                    enterableSubjects.map((item) => [
                      item.subjectId,
                      item.subjectName,
                    ]),
                  )}
                  onValueChange={(value) =>
                    setSubjectId((value as Id<"subjects">) || "")
                  }
                >
                  <SelectTrigger className="w-full">
                    <span className="truncate">
                      {selectedSubject?.subjectName ?? "Select subject"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {enterableSubjects.map((item) => (
                      <SelectItem key={item.subjectId} value={item.subjectId}>
                        {item.subjectName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {canEdit && classId && subjectId && selectedSubject ? (
        <MarksEditor
          key={`${classId}:${subjectId}:${month}`}
          classId={classId}
          subjectId={subjectId}
          month={month}
          title={`${selectedSubject?.subjectName ?? "Subject"} · ${monthLabel(year, monthNumber)}`}
        />
      ) : null}

      {classId && record === undefined ? (
        <p className="text-sm text-muted-foreground">Loading marks…</p>
      ) : null}

      {record ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {record.classLabel} · {monthLabel(year, monthNumber)}
            </CardTitle>
            <CardDescription>
              {record.students.length === 0
                ? "No enrolled students in this class."
                : `${record.students.length} students · marks out of ${record.maxMarks}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {record.subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No subjects are on this class timetable.
              </p>
            ) : record.students.length === 0 ? null : (
              <>
                <div className="max-w-sm space-y-2">
                  <Label htmlFor="monthly-test-search">Find a student</Label>
                  <Input
                    id="monthly-test-search"
                    value={search}
                    placeholder="Name or admission number"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                {students.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No students match that search.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Admission no.</TableHead>
                          {record.subjects.map((subject) => (
                            <TableHead key={subject.subjectId} className="text-center">
                              {subject.subjectName}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map((student) => (
                          <TableRow key={student.studentId}>
                            <TableCell className="font-medium">
                              <button
                                type="button"
                                className="text-left font-medium text-black no-underline underline-offset-2 hover:underline hover:decoration-black focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                aria-label={`Monthly test history for ${student.studentName}`}
                                onClick={() => setHistoryStudentId(student.studentId)}
                              >
                                {student.studentName}
                              </button>
                            </TableCell>
                            <TableCell>{student.admissionNumber}</TableCell>
                            {student.marks.map((mark, index) => (
                              <TableCell
                                key={record.subjects[index]?.subjectId ?? index}
                                className="text-center"
                              >
                                {formatStored(mark)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default function MonthlyTestsPage() {
  const me = useQuery(api.users.me);

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (
    me === null ||
    (me.role !== "teacher" && me.role !== "super_admin") ||
    me.staffRole === "driver" ||
    me.staffRole === "staff"
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        Monthly tests are for admins, teachers, incharges, and data entry.
      </p>
    );
  }
  if (
    me.staffRole !== "data_entry" &&
    (me.role === "super_admin" || me.staffRole === "observer")
  ) {
    return <OfficeMonthlyTests canEdit={me.staffRole !== "observer"} />;
  }
  return <TeacherMonthlyTests />;
}
