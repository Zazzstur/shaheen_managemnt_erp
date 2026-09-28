"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function todayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function gradeFor(percent: number) {
  if (percent >= 90) return "A";
  if (percent >= 75) return "B";
  if (percent >= 60) return "C";
  if (percent >= 40) return "D";
  return "F";
}

const CATEGORIES = [
  { id: "class_test_1", label: "Class test 1 — 20", composite: false },
  { id: "half_yearly", label: "Half yearly — 100", composite: true },
  { id: "class_test_2", label: "Class test 2 — 20", composite: false },
  { id: "annual", label: "Annual — 100", composite: true },
] as const;

type ReportCategory = (typeof CATEGORIES)[number]["id"];

function formatMark(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function TeacherMarksEntry({ showHeading = true }: { showHeading?: boolean }) {
  const classes = useQuery(api.catalog.listClasses);
  const subjects = useQuery(api.catalog.listSubjects);
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const [subjectId, setSubjectId] = useState<Id<"subjects"> | "">("");
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [date] = useState(todayIso);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [notebooks, setNotebooks] = useState<Record<string, string>>({});
  const [enrichments, setEnrichments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const seededFor = useRef("");
  const saveCategoryMarks = useMutation(api.reportCards.saveCategoryMarks);
  const sheet = useQuery(
    api.reportCards.categorySheet,
    classId && subjectId ? { classId, subjectId } : "skip",
  );
  const selectedCategory = CATEGORIES.find((item) => item.id === category);

  useEffect(() => {
    if (!sheet || !category || !classId || !subjectId) {
      return;
    }
    const rosterKey = sheet.students.map((student) => student.studentId).join(",");
    const key = `${classId}:${subjectId}:${category}:${rosterKey}`;
    if (seededFor.current === key) {
      return;
    }
    seededFor.current = key;
    const nextScores: Record<string, string> = {};
    const nextNotebooks: Record<string, string> = {};
    const nextEnrichments: Record<string, string> = {};
    for (const student of sheet.students) {
      if (category === "class_test_1" && student.classTest1 !== null) {
        nextScores[student.studentId] = String(student.classTest1);
      }
      if (category === "class_test_2" && student.classTest2 !== null) {
        nextScores[student.studentId] = String(student.classTest2);
      }
      const part =
        category === "half_yearly"
          ? student.halfYearly
          : category === "annual"
            ? student.annual
            : null;
      if (part) {
        nextScores[student.studentId] = String(part.written);
        nextNotebooks[student.studentId] = String(part.notebook);
        nextEnrichments[student.studentId] = String(part.enrichment);
      }
    }
    setScores(nextScores);
    setNotebooks(nextNotebooks);
    setEnrichments(nextEnrichments);
  }, [sheet, category, classId, subjectId]);

  const subjectName =
    (subjects ?? []).find((subject) => subject._id === subjectId)?.name ??
    "Subject";

  async function onSave() {
    if (!classId || !subjectId || !category || !sheet || !selectedCategory) {
      toast.error("Select a class, subject, and category");
      return;
    }
    const marks = [];
    for (const student of sheet.students) {
      const writtenRaw = (scores[student.studentId] ?? "").trim();
      const notebookRaw = (notebooks[student.studentId] ?? "").trim();
      const enrichmentRaw = (enrichments[student.studentId] ?? "").trim();
      if (selectedCategory.composite) {
        if (!writtenRaw && !notebookRaw && !enrichmentRaw) {
          continue;
        }
        marks.push({
          studentId: student.studentId,
          marksObtained: Number(writtenRaw || 0),
          notebookMarks: Number(notebookRaw || 0),
          enrichmentMarks: Number(enrichmentRaw || 0),
        });
      } else if (writtenRaw) {
        marks.push({
          studentId: student.studentId,
          marksObtained: Number(writtenRaw),
        });
      }
    }
    setSaving(true);
    try {
      await saveCategoryMarks({
        classId,
        subjectId,
        date,
        category,
        marks,
      });
      toast.success("Marks saved");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {showHeading ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Report cards</h1>
          <p className="text-sm text-muted-foreground">
            Choose a class, subject, and category. Half yearly and annual are 80
            written + 5 notebook + 5 subject enrichment + half of the class test.
          </p>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Subject marks</CardTitle>
          <CardDescription>
            Class test 1 feeds half yearly. Class test 2 feeds annual.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Class</Label>
            <Select
              value={classId || null}
              items={Object.fromEntries(
                (classes ?? []).map((classroom) => [
                  classroom._id,
                  `${classroom.name} ${classroom.section}`.trim(),
                ]),
              )}
              onValueChange={(value) => {
                setClassId((value as Id<"classes">) || "");
                seededFor.current = "";
              }}
            >
              <SelectTrigger className="w-full">
                <span className="truncate">
                  {(() => {
                    const selectedClass = (classes ?? []).find(
                      (classroom) => classroom._id === classId,
                    );
                    return selectedClass
                      ? `${selectedClass.name} ${selectedClass.section}`.trim()
                      : "Select class";
                  })()}
                </span>
              </SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((classroom) => (
                  <SelectItem key={classroom._id} value={classroom._id}>
                    {classroom.name} {classroom.section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Select
              value={subjectId || null}
              items={Object.fromEntries(
                (subjects ?? []).map((subject) => [subject._id, subject.name]),
              )}
              onValueChange={(value) => {
                setSubjectId((value as Id<"subjects">) || "");
                seededFor.current = "";
              }}
            >
              <SelectTrigger className="w-full">
                <span className="truncate">
                  {(subjects ?? []).find((subject) => subject._id === subjectId)
                    ?.name ?? "Select subject"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {(subjects ?? []).map((subject) => (
                  <SelectItem key={subject._id} value={subject._id}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={category || null}
              items={Object.fromEntries(
                CATEGORIES.map((item) => [item.id, item.label]),
              )}
              onValueChange={(value) => {
                if (
                  value === "class_test_1" ||
                  value === "half_yearly" ||
                  value === "class_test_2" ||
                  value === "annual"
                ) {
                  setCategory(value);
                  seededFor.current = "";
                }
              }}
            >
              <SelectTrigger className="w-full">
                <span className="truncate">
                  {selectedCategory?.label ?? "Select category"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {classId && subjectId && selectedCategory && sheet ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {subjectName} · {selectedCategory.label}
            </CardTitle>
            <CardDescription>
              {sheet.classLabel}
              {selectedCategory.composite
                ? " · total is out of 100"
                : " · enter marks out of 20"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sheet.students.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No enrolled students in this class.
              </p>
            ) : (
              <div className="space-y-4">
                {sheet.students.map((student) => {
                  const classTest = selectedCategory.id === "half_yearly"
                    ? student.classTest1
                    : selectedCategory.id === "annual"
                      ? student.classTest2
                      : null;
                  const classTestPart = classTest === null ? null : classTest / 2;
                  const written = Number(scores[student.studentId] || 0);
                  const notebook = Number(notebooks[student.studentId] || 0);
                  const enrichment = Number(enrichments[student.studentId] || 0);
                  const total =
                    written + notebook + enrichment + (classTestPart ?? 0);
                  return (
                    <div
                      key={student.studentId}
                      className="grid gap-2 border-b pb-3 sm:grid-cols-[180px_1fr] sm:items-center"
                    >
                      <p className="font-medium">{student.studentName}</p>
                      {selectedCategory.composite ? (
                        <div className="grid gap-2 sm:grid-cols-5">
                          <div className="space-y-1">
                            <Label htmlFor={`written-${student.studentId}`}>
                              Written / 80
                            </Label>
                            <Input
                              id={`written-${student.studentId}`}
                              inputMode="decimal"
                              value={scores[student.studentId] ?? ""}
                              onChange={(event) =>
                                setScores((current) => ({
                                  ...current,
                                  [student.studentId]: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`notebook-${student.studentId}`}>
                              Notebook / 5
                            </Label>
                            <Input
                              id={`notebook-${student.studentId}`}
                              inputMode="decimal"
                              value={notebooks[student.studentId] ?? ""}
                              onChange={(event) =>
                                setNotebooks((current) => ({
                                  ...current,
                                  [student.studentId]: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`enrichment-${student.studentId}`}>
                              Enrichment / 5
                            </Label>
                            <Input
                              id={`enrichment-${student.studentId}`}
                              inputMode="decimal"
                              value={enrichments[student.studentId] ?? ""}
                              onChange={(event) =>
                                setEnrichments((current) => ({
                                  ...current,
                                  [student.studentId]: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Class test / 2</p>
                            <p className="flex h-9 items-center text-sm text-muted-foreground">
                              {classTestPart === null
                                ? "Not entered"
                                : formatMark(classTestPart)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Total / 100</p>
                            <p className="flex h-9 items-center text-sm">
                              {formatMark(total)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <Input
                          id={`score-${student.studentId}`}
                          inputMode="decimal"
                          placeholder="Out of 20"
                          aria-label={`${student.studentName} marks`}
                          value={scores[student.studentId] ?? ""}
                          onChange={(event) =>
                            setScores((current) => ({
                              ...current,
                              [student.studentId]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <Button
              type="button"
              disabled={saving || sheet.students.length === 0}
              onClick={() => void onSave()}
            >
              {saving ? "Saving…" : "Save marks"}
            </Button>
          </CardContent>
        </Card>
      ) : classId && subjectId && category && sheet === undefined ? (
        <p className="text-sm text-muted-foreground">Loading students…</p>
      ) : null}
    </div>
  );
}

function dash(value: number | null) {
  return value === null ? "—" : formatMark(value);
}

export default function ReportCardsPage() {
  const me = useQuery(api.users.me);
  const classes = useQuery(api.catalog.listClasses);
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [date, setDate] = useState(todayIso);
  const [studentId, setStudentId] = useState<Id<"students"> | "">("");
  const selectedCategory = CATEGORIES.find((item) => item.id === category);
  const report = useQuery(
    api.reportCards.printableReport,
    classId && category ? { classId, category } : "skip",
  );

  const selected = report?.students.find((student) => student.studentId === studentId);
  const totals = useMemo(() => {
    const lines = (selected?.lines ?? []).filter((line) => line.total !== null);
    const obtained = lines.reduce((sum, line) => sum + (line.total ?? 0), 0);
    const maximum = lines.reduce((sum, line) => sum + line.maxMarks, 0);
    const percent = maximum === 0 ? null : Math.round((obtained / maximum) * 100);
    return { obtained, maximum, percent };
  }, [selected]);

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (me === null || (me.role !== "teacher" && me.role !== "super_admin")) {
    return (
      <p className="text-sm text-muted-foreground">
        Only staff can create report cards.
      </p>
    );
  }
  if (me.role === "teacher") {
    return <TeacherMarksEntry />;
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Report cards</h1>
        <p className="text-sm text-muted-foreground">
          Choose a class and category, then print a student report. Teachers
          enter the marks from their own login.
        </p>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Print a report card</CardTitle>
          <CardDescription>
            Marks already saved by teachers appear here.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Class</Label>
            <Select
              value={classId || null}
              items={Object.fromEntries(
                (classes ?? []).map((classroom) => [
                  classroom._id,
                  `${classroom.name} ${classroom.section}`.trim(),
                ]),
              )}
              onValueChange={(value) => {
                setClassId((value as Id<"classes">) || "");
                setStudentId("");
              }}
            >
              <SelectTrigger className="w-full">
                <span className="truncate">
                  {(() => {
                    const selectedClass = (classes ?? []).find(
                      (classroom) => classroom._id === classId,
                    );
                    return selectedClass
                      ? `${selectedClass.name} ${selectedClass.section}`.trim()
                      : "Select class";
                  })()}
                </span>
              </SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((classroom) => (
                  <SelectItem key={classroom._id} value={classroom._id}>
                    {classroom.name} {classroom.section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={category || null}
              items={Object.fromEntries(
                CATEGORIES.map((item) => [item.id, item.label]),
              )}
              onValueChange={(value) => {
                if (
                  value === "class_test_1" ||
                  value === "half_yearly" ||
                  value === "class_test_2" ||
                  value === "annual"
                ) {
                  setCategory(value);
                  setStudentId("");
                }
              }}
            >
              <SelectTrigger className="w-full">
                <span className="truncate">
                  {selectedCategory?.label ?? "Select category"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-date">Date on report</Label>
            <Input
              id="report-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {classId && category && report ? (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle>Students</CardTitle>
              <CardDescription>{report.classLabel}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {report.students.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No enrolled students in this class.
                </p>
              ) : (
                report.students.map((student) => (
                  <Button
                    key={student.studentId}
                    type="button"
                    variant={studentId === student.studentId ? "default" : "outline"}
                    className="w-full justify-start"
                    onClick={() => setStudentId(student.studentId)}
                  >
                    {student.studentName}
                  </Button>
                ))
              )}
            </CardContent>
          </Card>

          {selected ? (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Report card</CardTitle>
                  <CardDescription>
                    {report.categoryTitle} · {report.classLabel}
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="print:hidden"
                  onClick={() => window.print()}
                >
                  Print
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Student: </span>
                    {selected.studentName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Admission: </span>
                    {selected.admissionNumber}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Parent: </span>
                    {selected.guardianName ?? "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Date: </span>
                    {date}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Attendance: </span>
                    {selected.attendancePercent === null
                      ? "No records"
                      : `${selected.attendancePercent}% (${selected.attendancePresent}/${selected.attendanceMarked} present)`}
                  </p>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      {report.composite ? (
                        <>
                          <TableHead>Written</TableHead>
                          <TableHead>Notebook</TableHead>
                          <TableHead>Enrichment</TableHead>
                          <TableHead>Class test / 2</TableHead>
                          <TableHead>Total</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead>Marks</TableHead>
                          <TableHead>Max</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.lines.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={report.composite ? 6 : 3}
                          className="text-muted-foreground"
                        >
                          No marks yet. Teachers enter these from their report
                          card page.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selected.lines.map((line) => (
                        <TableRow key={line.subjectId}>
                          <TableCell>{line.subjectName}</TableCell>
                          {report.composite ? (
                            <>
                              <TableCell>{dash(line.written)}</TableCell>
                              <TableCell>{dash(line.notebook)}</TableCell>
                              <TableCell>{dash(line.enrichment)}</TableCell>
                              <TableCell>
                                {line.classTestHalf === null
                                  ? "Not entered"
                                  : formatMark(line.classTestHalf)}
                              </TableCell>
                              <TableCell>
                                {line.total === null
                                  ? "—"
                                  : `${formatMark(line.total)} / 100`}
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell>{dash(line.total)}</TableCell>
                              <TableCell>20</TableCell>
                            </>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                <div className="grid gap-1 text-sm">
                  <p>
                    Total: {formatMark(totals.obtained)}
                    {totals.maximum > 0 ? ` / ${totals.maximum}` : ""}
                  </p>
                  <p>
                    Percentage:{" "}
                    {totals.percent === null ? "—" : `${totals.percent}%`}
                  </p>
                  <p>
                    Grade:{" "}
                    {totals.percent === null ? "—" : gradeFor(totals.percent)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground print:hidden">
              Select a student to print their report card.
            </p>
          )}
        </div>
      ) : classId && category && report === undefined ? (
        <p className="text-sm text-muted-foreground">Loading report…</p>
      ) : null}
    </div>
  );
}
