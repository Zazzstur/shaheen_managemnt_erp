"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { isSchoolAdmin } from "@/lib/access";
import {
  feeYearRange,
  feeYearStartYear,
  monthLabel,
} from "@convex/lib/feeLedger";
import {
  EnrolledStudentSearch,
  type EnrolledStudentHit,
} from "@/components/enrolled-student-search";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function currentMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function previousMonth(month: string) {
  const year = Number(month.slice(0, 4));
  const part = Number(month.slice(5, 7));
  if (part === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(part - 1).padStart(2, "0")}`;
}

function feeSplitText(
  effectiveMonth: string,
  fromLabel: string,
  toLabel: string,
) {
  const range = feeYearRange(feeYearStartYear(`${effectiveMonth}-01`));
  if (effectiveMonth <= range.fromMonth) {
    return `${monthLabel(range.fromMonth)}–${monthLabel(range.throughMonth)} use ${toLabel} fees.`;
  }
  return `${monthLabel(range.fromMonth)}–${monthLabel(previousMonth(effectiveMonth))} stay on ${fromLabel} fees. ${monthLabel(effectiveMonth)}–${monthLabel(range.throughMonth)} use ${toLabel} fees.`;
}

function classOptionLabel(classroom: {
  name: string;
  section: string;
  academicYear: string;
}) {
  return `${classroom.name} ${classroom.section}`.trim();
}

export default function ClassChangePage() {
  const me = useQuery(api.users.me);
  const admin = me ? isSchoolAdmin(me) : false;
  const classes = useQuery(api.studentMoves.listClasses, admin ? {} : "skip");
  const changeClass = useMutation(api.studentMoves.changeClass);
  const [student, setStudent] = useState<EnrolledStudentHit | null>(null);
  const [toClassId, setToClassId] = useState<Id<"classes"> | "">("");
  const [effectiveMonth, setEffectiveMonth] = useState(currentMonth);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (me === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Signed in, but no user profile was found.
      </p>
    );
  }
  if (!admin) {
    return (
      <p className="text-sm text-muted-foreground">
        Only school admins can change a student&apos;s class.
      </p>
    );
  }

  const nextClass = (classes ?? []).find(
    (classroom) => classroom._id === toClassId,
  );
  const split =
    student && nextClass && effectiveMonth
      ? feeSplitText(
          effectiveMonth,
          student.classLabel,
          classOptionLabel(nextClass),
        )
      : null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!student) {
      setFormError("Search and choose an enrolled student.");
      return;
    }
    if (!toClassId) {
      setFormError("Choose the new class.");
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(effectiveMonth)) {
      setFormError("Choose the month the class change starts.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await changeClass({
        studentId: student.studentId,
        toClassId,
        effectiveMonth,
      });
      toast.success("Class changed");
      setStudent(null);
      setToClassId("");
    } catch (error) {
      const message = mutationResult(error).message;
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Class change</h1>
        <p className="text-sm text-muted-foreground">
          Move an enrolled student to another class. The fee year runs from
          April through March. Months before the change keep the old class
          fee. From the month you choose, fees use the new class.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Change class</CardTitle>
          <CardDescription>
            Search by name or admission number, then choose the new class and
            the month it starts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
            <div className="grid max-w-xl gap-2">
              <Label>Student</Label>
              <EnrolledStudentSearch
                selected={student}
                onSelect={(next) => {
                  setStudent(next);
                  setToClassId("");
                  setFormError(null);
                }}
              />
              {student ? (
                <p className="text-sm text-muted-foreground">
                  Current class: {student.classLabel}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No student selected.
                </p>
              )}
            </div>
            <div className="grid max-w-xl gap-2">
              <Label htmlFor="new-class">New class</Label>
              {classes === undefined ? (
                <p className="text-sm text-muted-foreground">Loading classes…</p>
              ) : classes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No classes yet. Create a class before changing a
                  student&apos;s class.
                </p>
              ) : (
                <select
                  id="new-class"
                  value={toClassId}
                  onChange={(event) => {
                    setToClassId(event.target.value as Id<"classes"> | "");
                    setFormError(null);
                  }}
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  <option value="">Choose a class</option>
                  {classes.map((classroom) => (
                    <option
                      key={classroom._id}
                      value={classroom._id}
                      disabled={classroom._id === student?.classId}
                    >
                      {classOptionLabel(classroom)} ({classroom.academicYear})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid max-w-xs gap-2">
              <Label htmlFor="effective-month">Effective month</Label>
              <input
                id="effective-month"
                type="month"
                value={effectiveMonth}
                onChange={(event) => {
                  setEffectiveMonth(event.target.value);
                  setFormError(null);
                }}
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              />
            </div>
            {split ? (
              <p className="max-w-xl text-sm text-muted-foreground">{split}</p>
            ) : null}
            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
            <Button type="submit" disabled={saving || !student || !toClassId}>
              {saving ? "Saving…" : "Change class"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
