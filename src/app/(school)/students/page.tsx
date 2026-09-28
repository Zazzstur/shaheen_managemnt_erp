"use client";

import { Fragment, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { ChevronDown, ChevronRight, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { parseStudentCsv, studentCsvTemplate } from "@/lib/studentCsv";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { StudentDetailDialog } from "@/components/student-detail-dialog";

type FeeFilter = "all" | "due" | "paid" | "none";

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function feeBadge(status: "paid" | "due" | "none") {
  if (status === "paid") return "Paid";
  if (status === "due") return "Due";
  return "No invoice";
}

export default function StudentsDirectoryPage() {
  const me = useQuery(api.users.me);
  const classes = useQuery(api.catalog.listClasses);
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const [feeFilter, setFeeFilter] = useState<FeeFilter>("all");
  const [expandedId, setExpandedId] = useState<Id<"students"> | null>(null);
  const [selectedStudentId, setSelectedStudentId] =
    useState<Id<"students"> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    created: number;
    failed: Array<{ row: number; admissionNumber: string; message: string }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const enrollMany = useMutation(api.students.enrollMany);

  const canView = me?.role === "super_admin" || me?.role === "teacher";
  const canEnroll = me?.role === "super_admin";
  const isTeacher = me?.role === "teacher";
  const rows = useQuery(
    api.students.directory,
    canEnroll && classId
      ? {
          classId,
          feeFilter,
        }
      : "skip",
  );
  const teacherRows = useQuery(
    api.students.teacherDirectory,
    isTeacher && classId ? { classId } : "skip",
  );

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
        Only staff can view the student directory.
      </p>
    );
  }

  function downloadTemplate() {
    const blob = new Blob([studentCsvTemplate()], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "student-upload-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onUploadFile(file: File) {
    setUploading(true);
    setUploadResult(null);
    try {
      const text = await file.text();
      const students = parseStudentCsv(text);
      const today = new Date();
      const asOf = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const result = await enrollMany({ students, asOf });
      setUploadResult(result);
      if (result.failed.length === 0) {
        toast.success(
          `Enrolled ${result.created} student${result.created === 1 ? "" : "s"}`,
        );
      } else if (result.created === 0) {
        toast.error("No students were enrolled. Check the row errors.");
      } else {
        toast.success(
          `Enrolled ${result.created}. ${result.failed.length} row${result.failed.length === 1 ? "" : "s"} skipped.`,
        );
      }
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
        <p className="text-sm text-muted-foreground">
          {isTeacher
            ? "Student names, parent contact, and attendance."
            : "Class, fee payments, and attendance for enrolled students."}
        </p>
      </div>

      {canEnroll ? (
        <Card>
          <CardHeader>
            <CardTitle>Bulk upload</CardTitle>
            <CardDescription>
              Download the CSV template and fill one student per row. A row
              uploads when it has an admission number, student name, class,
              father name, and father number. Leave every other column blank.
              If a class name has more than one section, fill the section
              column too. Filled optional columns are still checked: social
              category is general, obc, sc, or st; affiliation is state, cbse,
              icse, or other; transport required is yes or no; gender is
              female, male, or other. Date of birth can be YYYY-MM-DD or
              DD-MM-YYYY. Put addresses that contain commas in quotes. If an
              amount paid is entered, also enter the admission date.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={downloadTemplate}>
                <Download />
                Download CSV
              </Button>
              <Button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload />
                {uploading ? "Uploading…" : "Upload CSV"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void onUploadFile(file);
                  }
                }}
              />
            </div>
            {uploadResult ? (
              <div className="space-y-2 text-sm">
                <p>
                  Enrolled {uploadResult.created}. Skipped{" "}
                  {uploadResult.failed.length}.
                </p>
                {uploadResult.failed.length > 0 ? (
                  <ul className="space-y-1 text-destructive">
                    {uploadResult.failed.map((failure) => (
                      <li key={`${failure.row}-${failure.admissionNumber}`}>
                        Row {failure.row}
                        {failure.admissionNumber
                          ? ` (${failure.admissionNumber})`
                          : ""}
                        : {failure.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
          <CardDescription>
            {isTeacher
              ? "Filter by class. Parent contact and attendance only."
              : "Select a student to view their details. Expand a row to see invoices."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
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
                onValueChange={(value) =>
                  setClassId((value as Id<"classes">) || "")
                }
              >
                <SelectTrigger className="w-full">
                  <span className="truncate">
                    {(() => {
                      const selected = (classes ?? []).find(
                        (classroom) => classroom._id === classId,
                      );
                      return selected
                        ? `${selected.name} ${selected.section}`.trim()
                        : "No classes";
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
              {classId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setClassId("")}
                >
                  Clear class filter
                </Button>
              ) : null}
            </div>
            {isTeacher ? null : (
            <div className="space-y-2">
              <Label>Fee</Label>
              <Select
                value={feeFilter}
                items={{
                  all: "All fee statuses",
                  due: "Due",
                  paid: "Paid",
                  none: "No invoice",
                }}
                onValueChange={(value) => {
                  if (
                    value === "all" ||
                    value === "due" ||
                    value === "paid" ||
                    value === "none"
                  ) {
                    setFeeFilter(value);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All fee statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All fee statuses</SelectItem>
                  <SelectItem value="due">Due</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="none">No invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            )}
          </div>

          {isTeacher ? (
            !classId ? (
              <p className="text-sm text-muted-foreground">
                Select a class to see students.
              </p>
            ) : teacherRows === undefined ? (
              <p className="text-sm text-muted-foreground">Loading students…</p>
            ) : teacherRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No students match this class.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Parent number</TableHead>
                    <TableHead>Attendance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teacherRows.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell className="font-medium">
                        {row.studentName}
                      </TableCell>
                      <TableCell>{row.guardianName ?? "—"}</TableCell>
                      <TableCell>{row.guardianPhone ?? "—"}</TableCell>
                      <TableCell>
                        {row.attendancePercent === null
                          ? "—"
                          : `${row.attendancePercent}%`}
                        <div className="text-xs text-muted-foreground">
                          {row.attendanceMarked === 0
                            ? "No records"
                            : `${row.attendancePresent}/${row.attendanceMarked} present`}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : !classId ? (
            <p className="text-sm text-muted-foreground">
              Select a class to see students.
            </p>
          ) : rows === undefined ? (
            <p className="text-sm text-muted-foreground">Loading students…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No students match these filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Attendance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const expanded = expandedId === row.studentId;
                  return (
                    <Fragment key={row.studentId}>
                      <TableRow key={row.studentId}>
                        <TableCell>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-expanded={expanded}
                            aria-label={
                              expanded
                                ? "Hide fee records"
                                : "Show fee records"
                            }
                            onClick={() =>
                              setExpandedId(expanded ? null : row.studentId)
                            }
                          >
                            {expanded ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="text-left hover:underline"
                            onClick={() => setSelectedStudentId(row.studentId)}
                          >
                            <div className="font-medium">{row.studentName}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.admissionNumber}
                            </div>
                          </button>
                        </TableCell>
                        <TableCell>{row.classLabel}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {feeBadge(row.feeStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell>{money(row.paid)}</TableCell>
                        <TableCell>{money(row.due)}</TableCell>
                        <TableCell>
                          {row.attendancePercent === null
                            ? "—"
                            : `${row.attendancePercent}%`}
                          <div className="text-xs text-muted-foreground">
                            {row.attendanceMarked === 0
                              ? "No records"
                              : `${row.attendancePresent}/${row.attendanceMarked} present`}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow key={`${row.studentId}-fees`}>
                          <TableCell colSpan={7}>
                            {row.invoices.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No fee payment records for this student.
                              </p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Invoice</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Paid</TableHead>
                                    <TableHead>Due date</TableHead>
                                    <TableHead>Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {row.invoices.map((invoice) => (
                                    <TableRow key={invoice._id}>
                                      <TableCell>
                                        {invoice.invoiceNumber}
                                      </TableCell>
                                      <TableCell>
                                        {money(invoice.amount)}
                                      </TableCell>
                                      <TableCell>
                                        {money(invoice.paidAmount)}
                                      </TableCell>
                                      <TableCell>{invoice.dueDate}</TableCell>
                                      <TableCell>
                                        <Badge variant="secondary">
                                          {invoice.status}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {canEnroll ? (
        <StudentDetailDialog
          studentId={selectedStudentId}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedStudentId(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}
