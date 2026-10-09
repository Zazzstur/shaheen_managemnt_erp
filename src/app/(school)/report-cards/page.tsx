"use client";

import { useEffect, useRef, useState } from "react";
import type { FunctionReturnType } from "convex/server";
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

function gradeFor(percent: number | null) {
  if (percent === null || Number.isNaN(percent)) return "";
  if (percent >= 90) return "A+";
  if (percent >= 80) return "A";
  if (percent >= 70) return "B+";
  if (percent >= 60) return "B";
  if (percent >= 50) return "C";
  if (percent >= 33) return "D";
  return "E";
}

const CATEGORIES = [
  { id: "class_test_1", label: "Periodic test 1 — 20", composite: false },
  { id: "half_yearly", label: "Half yearly — 100", composite: true },
  { id: "class_test_2", label: "Periodic test 2 — 20", composite: false },
  { id: "annual", label: "Annual — 100", composite: true },
] as const;

type ReportCategory = (typeof CATEGORIES)[number]["id"];

function formatMark(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function dash(value: number | null) {
  return value === null ? "—" : formatMark(value);
}

function printMark(value: number | "AB" | null) {
  if (value === "AB") {
    return "AB";
  }
  return dash(value);
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

function draftComponent(value: string | undefined): number | "AB" | "blank" {
  const trimmed = (value ?? "").trim();
  if (trimmed === "" || /^a$/i.test(trimmed)) {
    return "blank";
  }
  if (/^ab$/i.test(trimmed)) {
    return "AB";
  }
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : "blank";
}

function printCategoryTitle(title: string) {
  return title.replace(/\b1\b/g, "I").replace(/\b2\b/g, "II").toUpperCase();
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
        const written = parseMarkField(writtenRaw, 80);
        const notebook = parseMarkField(notebookRaw, 5);
        const enrichment = parseMarkField(enrichmentRaw, 5);
        if (
          written.state === "empty" &&
          notebook.state === "empty" &&
          enrichment.state === "empty"
        ) {
          marks.push({ studentId: student.studentId, cleared: true });
          continue;
        }
        if (written.state === "invalid") {
          toast.error(
            `${student.studentName}: written marks must be between 0 and 80, or AB`,
          );
          return;
        }
        if (notebook.state === "invalid") {
          toast.error(
            `${student.studentName}: notebook marks must be between 0 and 5, or AB`,
          );
          return;
        }
        if (enrichment.state === "invalid") {
          toast.error(
            `${student.studentName}: subject enrichment marks must be between 0 and 5, or AB`,
          );
          return;
        }
        marks.push({
          studentId: student.studentId,
          marksObtained: storedMark(written),
          notebookMarks: storedMark(notebook),
          enrichmentMarks: storedMark(enrichment),
        });
      } else if (writtenRaw) {
        const written = parseMarkField(writtenRaw, 20);
        if (written.state === "invalid" || written.state === "empty") {
          toast.error(`${student.studentName}: marks must be between 0 and 20, or AB`);
          return;
        }
        marks.push({
          studentId: student.studentId,
          marksObtained: storedMark(written),
        });
      } else {
        marks.push({ studentId: student.studentId, cleared: true });
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
            written + 5 notebook + 5 subject enrichment + half of the periodic test.
          </p>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Subject marks</CardTitle>
          <CardDescription>
            Periodic test 1 feeds half yearly. Periodic test 2 feeds annual.
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
                  const classTestPart =
                    typeof classTest === "number" ? classTest / 2 : null;
                  const written = draftComponent(scores[student.studentId]);
                  const notebook = draftComponent(notebooks[student.studentId]);
                  const enrichment = draftComponent(enrichments[student.studentId]);
                  const anyAbsent =
                    written === "AB" ||
                    notebook === "AB" ||
                    enrichment === "AB" ||
                    classTest === "AB";
                  const total = anyAbsent
                    ? null
                    : (written === "blank" ? 0 : written) +
                      (notebook === "blank" ? 0 : notebook) +
                      (enrichment === "blank" ? 0 : enrichment) +
                      (classTestPart ?? 0);
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
                              inputMode="text"
                              value={scores[student.studentId] ?? ""}
                              onChange={(event) => {
                                const next = event.target.value;
                                if (!markWithinMax(next, 80)) {
                                  return;
                                }
                                setScores((current) => ({
                                  ...current,
                                  [student.studentId]: normalizeDraft(next),
                                }));
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`notebook-${student.studentId}`}>
                              Notebook / 5
                            </Label>
                            <Input
                              id={`notebook-${student.studentId}`}
                              inputMode="text"
                              value={notebooks[student.studentId] ?? ""}
                              onChange={(event) => {
                                const next = event.target.value;
                                if (!markWithinMax(next, 5)) {
                                  return;
                                }
                                setNotebooks((current) => ({
                                  ...current,
                                  [student.studentId]: normalizeDraft(next),
                                }));
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`enrichment-${student.studentId}`}>
                              Enrichment / 5
                            </Label>
                            <Input
                              id={`enrichment-${student.studentId}`}
                              inputMode="text"
                              value={enrichments[student.studentId] ?? ""}
                              onChange={(event) => {
                                const next = event.target.value;
                                if (!markWithinMax(next, 5)) {
                                  return;
                                }
                                setEnrichments((current) => ({
                                  ...current,
                                  [student.studentId]: normalizeDraft(next),
                                }));
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Periodic test / 2</p>
                            <p className="flex h-9 items-center text-sm text-muted-foreground">
                              {classTest === "AB"
                                ? "AB"
                                : classTestPart === null
                                  ? "Not entered"
                                  : formatMark(classTestPart)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Total / 100</p>
                            <p className="flex h-9 items-center text-sm">
                              {total === null ? "—" : formatMark(total)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <Input
                          id={`score-${student.studentId}`}
                          inputMode="text"
                          placeholder="Out of 20"
                          aria-label={`${student.studentName} marks`}
                          value={scores[student.studentId] ?? ""}
                          onChange={(event) => {
                            const next = event.target.value;
                            if (!markWithinMax(next, 20)) {
                              return;
                            }
                            setScores((current) => ({
                              ...current,
                              [student.studentId]: normalizeDraft(next),
                            }));
                          }}
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

const REPORT_TABLE_CLASS =
  "border-collapse border border-[#876738] [&_td]:border [&_td]:border-[#876738]/60 [&_th]:border [&_th]:border-[#876738]/60 [&_th]:bg-[#876738]/10 [&_th]:font-semibold [&_tr]:hover:bg-transparent";

const MARK_HEAD =
  "h-auto py-1.5 text-center align-middle leading-tight";

const MARK_CELL = "text-center align-middle";
const MARK_FIGURE = "text-center align-middle font-black";

type PrintableReport = FunctionReturnType<typeof api.reportCards.printableReport>;
type ReportStudent = PrintableReport["students"][number];

function studentTotals(lines: ReportStudent["lines"]) {
  const scored = lines.filter(
    (line): line is typeof line & { total: number } =>
      typeof line.total === "number",
  );
  const obtained = scored.reduce((sum, line) => sum + (line.total ?? 0), 0);
  const maximum = scored.reduce((sum, line) => sum + line.maxMarks, 0);
  const percentExact = maximum === 0 ? null : (obtained / maximum) * 100;
  const percent = percentExact === null ? null : Math.round(percentExact);
  return { obtained, maximum, percent, percentExact };
}

function ReportCardSheet({
  student,
  classLabel,
  categoryTitle,
  composite,
  category,
  className,
}: {
  student: ReportStudent;
  classLabel: string;
  categoryTitle: string;
  composite: boolean;
  category: ReportCategory;
  className?: string;
}) {
  const totals = studentTotals(student.lines);
  const markColumnCount = composite ? 7 : 4;

  return (
    <div
      className={`report-a4 box-border flex h-[297mm] w-[210mm] flex-col bg-[#EBE9DC] p-[32px] print:h-[297mm] print:w-[210mm] print:[print-color-adjust:exact] ${className ?? ""}`}
    >
      <div className="flex h-full min-h-0 flex-col border-[3px] border-[#876738] bg-[#EBE9DC] p-1.5 print:[print-color-adjust:exact]">
        <div className="flex h-full min-h-0 flex-col gap-4 border-[3px] border-[#876738] bg-[#EBE9DC] py-3 print:[print-color-adjust:exact]">
          <div className="flex items-start justify-between gap-3 px-3 text-[11px] leading-tight font-semibold">
            <p>REGI NO 20410392026514145806</p>
            <p className="shrink-0 text-right">UDISE CODE 10024103780</p>
          </div>
          <div className="flex flex-col items-center gap-1 px-2">
            <div className="flex w-full items-center justify-center gap-2">
              <img
                src="/shaheen-academy-logo.svg"
                alt="Shaheen Academy crest"
                className="h-24 w-auto shrink-0"
              />
              <div className="flex flex-col items-center">
                <p className="text-center text-2xl font-bold tracking-wide">
                  SHAHEEN ACADEMY CHAMPARAN
                </p>
                <p className="text-center text-base font-medium">
                  ---Estd. 2025---
                </p>
              </div>
              <img
                src="/shaheen-academy-logo.svg"
                alt=""
                aria-hidden="true"
                className="h-24 w-auto shrink-0"
              />
            </div>
            <p className="max-w-full text-center text-sm leading-snug text-balance">
              Shaheen Chowk Murli,Post. Pachpakari,P.S. Dhaka,Distt. East
              Champaran,Bihar-845427
            </p>
          </div>
          <div className="flex flex-col gap-1 px-6">
            <p className="text-center text-2xl font-bold">REPORT CARD</p>
            <p className="text-center text-lg font-bold tracking-wide">
              {printCategoryTitle(categoryTitle)} EXAMINATION
            </p>
            <p className="text-center text-lg font-bold tracking-wide">2026-2027</p>
            <p className="text-left text-sm font-bold">{classLabel}</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-6">
            <Table className={REPORT_TABLE_CLASS}>
              <TableBody>
                <TableRow>
                  <TableHead>Student name</TableHead>
                  <TableCell>{student.studentName}</TableCell>
                  <TableHead>Reg. no.</TableHead>
                  <TableCell>{student.admissionNumber}</TableCell>
                </TableRow>
                <TableRow>
                  <TableHead>Parent name</TableHead>
                  <TableCell>{student.guardianName ?? "—"}</TableCell>
                  <TableHead>Attendance</TableHead>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>

            <Table className={`${REPORT_TABLE_CLASS} table-fixed text-xs [&_td]:whitespace-normal [&_td]:px-1.5 [&_th]:whitespace-normal [&_th]:px-1.5`}>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Subject</TableHead>
                  {composite ? (
                    <>
                      <TableHead className={MARK_HEAD}>
                        <span className="block text-center">
                          {category === "annual"
                            ? "Periodic Test II"
                            : "Periodic Test I"}
                        </span>
                        <span className="block text-center font-normal">(10)</span>
                      </TableHead>
                      <TableHead className={MARK_HEAD}>
                        <span className="block text-center">Notebook</span>
                        <span className="block text-center font-normal">(5)</span>
                      </TableHead>
                      <TableHead className={MARK_HEAD}>
                        <span className="block text-center">Subject Enrichment</span>
                        <span className="block text-center font-normal">(5)</span>
                      </TableHead>
                      <TableHead className={MARK_HEAD}>
                        <span className="block text-center">
                          {category === "annual"
                            ? "Annual"
                            : category === "half_yearly"
                              ? "Half Yearly"
                              : "Marks"}
                        </span>
                        <span className="block text-center font-normal">(80)</span>
                      </TableHead>
                      <TableHead className={MARK_HEAD}>Total</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className={MARK_HEAD}>Marks</TableHead>
                      <TableHead className={MARK_HEAD}>Max</TableHead>
                    </>
                  )}
                  <TableHead className={MARK_HEAD}>Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {student.lines.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={markColumnCount}
                      className="text-muted-foreground"
                    >
                      No marks yet. Teachers enter these from their report
                      card page.
                    </TableCell>
                  </TableRow>
                ) : (
                  student.lines.map((line) => (
                    <TableRow key={line.subjectId}>
                      <TableCell className="text-left font-black">
                        {line.subjectName}
                      </TableCell>
                      {composite ? (
                        <>
                          <TableCell className={MARK_FIGURE}>
                            {line.classTestHalf === "AB"
                              ? "AB"
                              : line.classTestHalf === null
                                ? "Not entered"
                                : formatMark(line.classTestHalf)}
                          </TableCell>
                          <TableCell className={MARK_FIGURE}>
                            {printMark(line.notebook)}
                          </TableCell>
                          <TableCell className={MARK_FIGURE}>
                            {printMark(line.enrichment)}
                          </TableCell>
                          <TableCell className={MARK_FIGURE}>
                            {printMark(line.written)}
                          </TableCell>
                          <TableCell className={MARK_FIGURE}>
                            {typeof line.total === "number"
                              ? `${formatMark(line.total)} / 100`
                              : "—"}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className={MARK_FIGURE}>
                            {printMark(line.total)}
                          </TableCell>
                          <TableCell className={MARK_FIGURE}>20</TableCell>
                        </>
                      )}
                      <TableCell className={MARK_FIGURE}>
                        {typeof line.total !== "number" || line.maxMarks === 0
                          ? "—"
                          : gradeFor((line.total / line.maxMarks) * 100)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
                <TableRow className="font-semibold">
                  <TableCell colSpan={markColumnCount - 2} className="text-left">
                    Total
                  </TableCell>
                  <TableCell colSpan={2} className={MARK_FIGURE}>
                    {formatMark(totals.obtained)}
                    {totals.maximum > 0 ? ` / ${totals.maximum}` : ""}
                  </TableCell>
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell colSpan={markColumnCount - 2} className="text-left">
                    Percentage
                  </TableCell>
                  <TableCell colSpan={2} className={MARK_CELL}>
                    {totals.percent === null ? "—" : `${totals.percent}%`}
                  </TableCell>
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell colSpan={markColumnCount - 2} className="text-left">
                    Grade
                  </TableCell>
                  <TableCell colSpan={2} className={MARK_CELL}>
                    {totals.percentExact === null
                      ? "—"
                      : gradeFor(totals.percentExact)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <div className="pt-2">
              <div className="flex h-6 items-end gap-2">
                <span className="text-sm leading-none font-semibold">
                  Remark:
                </span>
                <div
                  aria-hidden="true"
                  className="flex-1 border-b-2 border-[#876738]"
                />
              </div>
              {[0, 1].map((line) => (
                <div
                  key={line}
                  aria-hidden="true"
                  className="h-6 border-b-2 border-[#876738]"
                />
              ))}
            </div>

            <div className="min-h-4 flex-1" />

            <div className="grid grid-cols-3 gap-8 pb-2">
              {["Class teacher signature", "Parent signature", "School stamp"].map(
                (label) => (
                  <div key={label} className="flex flex-col items-center gap-1.5">
                    <div
                      aria-hidden="true"
                      className="w-full max-w-40 border-b border-[#876738]"
                    />
                    <p className="text-center text-xs">{label}</p>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportCardsPage() {
  const me = useQuery(api.users.me);
  const classes = useQuery(api.catalog.listClasses);
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [studentId, setStudentId] = useState<Id<"students"> | "">("");
  const selectedCategory = CATEGORIES.find((item) => item.id === category);
  const report = useQuery(
    api.reportCards.printableReport,
    classId && category ? { classId, category } : "skip",
  );

  const selected = report?.students.find((student) => student.studentId === studentId);
  const printRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function resetPrintScope() {
      if (printRootRef.current) {
        printRootRef.current.dataset.printScope = "one";
      }
    }
    window.addEventListener("afterprint", resetPrintScope);
    return () => window.removeEventListener("afterprint", resetPrintScope);
  }, []);

  function printReport(scope: "one" | "all") {
    const root = printRootRef.current;
    if (root) {
      root.dataset.printScope = scope;
    }
    window.print();
  }

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

  const sheetProps =
    report && category
      ? {
          classLabel: report.classLabel,
          categoryTitle: report.categoryTitle,
          composite: report.composite,
          category,
        }
      : null;

  return (
    <div
      ref={printRootRef}
      data-print-scope="one"
      className="report-cards-page space-y-6"
    >
      <style>{`
        .print-all-sheets { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body {
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #EBE9DC !important;
          }
          .min-h-screen {
            min-height: 0 !important;
            height: auto !important;
          }
          .report-cards-page,
          .report-cards-page > * + * {
            margin: 0 !important;
            padding: 0 !important;
          }
          [data-print-scope="one"] .print-all-sheets { display: none !important; }
          [data-print-scope="one"] .report-screen-layout {
            display: block !important;
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            gap: 0 !important;
            overflow: hidden !important;
          }
          [data-print-scope="one"] .print-sheet-slot {
            width: 210mm !important;
            max-width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            gap: 0 !important;
          }
          [data-print-scope="all"] .report-screen-layout { display: none !important; }
          [data-print-scope="all"] .print-all-sheets { display: block !important; }
          .report-a4 {
            box-sizing: border-box !important;
            width: 210mm !important;
            height: calc(297mm - 1px) !important;
            max-height: calc(297mm - 1px) !important;
            margin: 0 !important;
            overflow: hidden !important;
            break-inside: avoid;
            page-break-inside: avoid;
            break-after: avoid;
            page-break-after: avoid;
          }
          .print-all-page {
            height: calc(297mm - 1px);
            overflow: hidden;
            break-after: page;
            page-break-after: always;
          }
          .print-all-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }
      `}</style>
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
        <CardContent className="grid gap-4 md:grid-cols-2">
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
        </CardContent>
      </Card>

      {classId && category && report && sheetProps ? (
        <>
        <div className="report-screen-layout grid items-start gap-6 overflow-x-auto lg:grid-cols-[240px_210mm]">
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

          {report.students.length > 0 ? (
            <div className="print-sheet-slot flex w-[210mm] max-w-[210mm] shrink-0 flex-col gap-2">
              <div className="flex justify-end gap-2 print:hidden">
                {selected ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => printReport("one")}
                  >
                    Print
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => printReport("all")}
                >
                  Print all
                </Button>
              </div>
              {selected ? (
                <ReportCardSheet
                  {...sheetProps}
                  student={selected}
                  className="print-one-sheet"
                />
              ) : (
                <p className="text-sm text-muted-foreground print:hidden">
                  Select a student to print their report card.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground print:hidden">
              Select a student to print their report card.
            </p>
          )}
        </div>
        {report.students.length > 0 ? (
          <div className="print-all-sheets" aria-hidden="true">
            {report.students.map((student) => (
              <div key={student.studentId} className="print-all-page">
                <ReportCardSheet {...sheetProps} student={student} />
              </div>
            ))}
          </div>
        ) : null}
        </>
      ) : classId && category && report === undefined ? (
        <p className="text-sm text-muted-foreground">Loading report…</p>
      ) : null}
    </div>
  );
}
