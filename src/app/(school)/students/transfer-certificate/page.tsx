"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { isSchoolAdmin } from "@/lib/access";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function TransferCertificatePage() {
  const me = useQuery(api.users.me);
  const admin = me ? isSchoolAdmin(me) : false;
  const withdraw = useMutation(api.studentMoves.withdraw);
  const [student, setStudent] = useState<EnrolledStudentHit | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
        Only school admins can issue a transfer certificate.
      </p>
    );
  }

  async function onConfirm() {
    if (!student) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await withdraw({ studentId: student.studentId });
      toast.success(`${student.studentName} marked withdrawn`);
      setStudent(null);
      setConfirmOpen(false);
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
        <h1 className="text-2xl font-semibold tracking-tight">
          Transfer certificate
        </h1>
        <p className="text-sm text-muted-foreground">
          Remove an enrolled student from school. Their record stays, with
          status withdrawn, so past fees and marks remain.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Issue transfer certificate</CardTitle>
          <CardDescription>
            Search by name or admission number. You will be asked to confirm
            before the student is withdrawn.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid max-w-xl gap-2">
            <Label>Student</Label>
            <EnrolledStudentSearch
              selected={student}
              onSelect={(next) => {
                setStudent(next);
                setFormError(null);
              }}
            />
            {student ? (
              <p className="text-sm text-muted-foreground">
                {student.studentName} · {student.admissionNumber} ·{" "}
                {student.classLabel}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No student selected.
              </p>
            )}
          </div>
          {formError ? (
            <p className="text-sm text-destructive">{formError}</p>
          ) : null}
          <Button
            type="button"
            variant="destructive"
            disabled={!student || saving}
            onClick={() => setConfirmOpen(true)}
          >
            Issue transfer certificate
          </Button>
        </CardContent>
      </Card>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this student from school?</DialogTitle>
            <DialogDescription>
              {student
                ? `${student.studentName} (${student.admissionNumber}) will be marked withdrawn and will leave enrolled lists. Past fees and marks stay on record.`
                : "Choose a student first."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void onConfirm()}
              disabled={!student || saving}
            >
              {saving ? "Removing…" : "Remove from school"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
