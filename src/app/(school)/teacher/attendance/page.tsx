"use client";

import { useMemo, useState } from "react";
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

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function AttendancePage() {
  const classes = useQuery(api.catalog.listClasses);
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
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
      toast.error("Select a class");
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Select a class and mark present, absent, or late for the day.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Class roster</CardTitle>
          <CardDescription>Changes save together as one batch.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
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
                  if (value) setClassId(value as Id<"classes">);
                  setMarks({});
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select class" />
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
