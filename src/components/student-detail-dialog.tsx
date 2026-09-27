"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Draft = {
  admissionNumber: string;
  fullName: string;
  dateOfBirth: string;
  gender: "female" | "male" | "other";
  placeOfBirth: string;
  religion: string;
  caste: string;
  motherTongue: string;
  socialCategory: string;
  aadhaarNumber: string;
  guardianName: string;
  motherName: string;
  guardianPhone: string;
  motherPhone: string;
  fatherAadhaarNumber: string;
  motherAadhaarNumber: string;
  email: string;
  residentialAddress: string;
  transportRequired: string;
  previousSchoolAffiliation: string;
  previousSchoolOther: string;
  previousSchoolName: string;
};

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function text(value: string | undefined | null) {
  return value && value.trim() ? value : "—";
}

function RequiredMark() {
  return <span className="text-destructive"> *</span>;
}

const SOCIAL = [
  ["general", "General"],
  ["obc", "OBC"],
  ["sc", "SC"],
  ["st", "ST"],
] as const;

const AFFILIATIONS = [
  ["state", "State"],
  ["cbse", "CBSE"],
  ["icse", "ICSE"],
  ["other", "Other"],
] as const;

export function StudentDetailDialog({
  studentId,
  onOpenChange,
}: {
  studentId: Id<"students"> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const profile = useQuery(
    api.students.profile,
    studentId ? { studentId } : "skip",
  );
  const updateProfile = useMutation(api.students.updateProfile);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    setEditing(false);
    setDraft(null);
  }, [studentId]);

  function startEdit() {
    if (!profile) {
      return;
    }
    setDraft({
      admissionNumber: profile.admissionNumber,
      fullName: profile.fullName,
      dateOfBirth: profile.dateOfBirth,
      gender: profile.gender,
      placeOfBirth: profile.placeOfBirth ?? "",
      religion: profile.religion ?? "",
      caste: profile.caste ?? "",
      motherTongue: profile.motherTongue ?? "",
      socialCategory: profile.socialCategory ?? "",
      aadhaarNumber: profile.aadhaarNumber ?? "",
      guardianName: profile.guardianName ?? "",
      motherName: profile.motherName ?? "",
      guardianPhone: profile.guardianPhone ?? "",
      motherPhone: profile.motherPhone ?? "",
      fatherAadhaarNumber: profile.fatherAadhaarNumber ?? "",
      motherAadhaarNumber: profile.motherAadhaarNumber ?? "",
      email: profile.email ?? "",
      residentialAddress: profile.residentialAddress ?? "",
      transportRequired:
        profile.transportRequired === undefined
          ? ""
          : profile.transportRequired
            ? "yes"
            : "no",
      previousSchoolAffiliation: profile.previousSchoolAffiliation ?? "",
      previousSchoolOther: profile.previousSchoolOther ?? "",
      previousSchoolName: profile.previousSchoolName ?? "",
    });
    setEditing(true);
  }

  async function onSave() {
    if (!studentId || !draft) {
      return;
    }
    const socialCategory = draft.socialCategory;
    const affiliation = draft.previousSchoolAffiliation;
    if (
      socialCategory !== "general" &&
      socialCategory !== "obc" &&
      socialCategory !== "sc" &&
      socialCategory !== "st"
    ) {
      toast.error("Select a social category");
      return;
    }
    if (draft.transportRequired !== "yes" && draft.transportRequired !== "no") {
      toast.error("Select whether school transportation is required");
      return;
    }
    if (
      affiliation !== "state" &&
      affiliation !== "cbse" &&
      affiliation !== "icse" &&
      affiliation !== "other"
    ) {
      toast.error("Select the previous school affiliation");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        studentId,
        admissionNumber: draft.admissionNumber,
        fullName: draft.fullName,
        dateOfBirth: draft.dateOfBirth,
        gender: draft.gender,
        placeOfBirth: draft.placeOfBirth,
        religion: draft.religion,
        caste: draft.caste,
        motherTongue: draft.motherTongue,
        socialCategory,
        guardianName: draft.guardianName,
        motherName: draft.motherName,
        guardianPhone: draft.guardianPhone,
        motherPhone: draft.motherPhone,
        aadhaarNumber: draft.aadhaarNumber,
        fatherAadhaarNumber: draft.fatherAadhaarNumber,
        motherAadhaarNumber: draft.motherAadhaarNumber,
        email: draft.email,
        residentialAddress: draft.residentialAddress,
        transportRequired: draft.transportRequired === "yes",
        previousSchoolAffiliation: affiliation,
        previousSchoolOther: draft.previousSchoolOther,
        previousSchoolName: draft.previousSchoolName,
      });
      toast.success("Student details saved");
      setEditing(false);
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  const feeLabel =
    profile?.feeStatus === "paid"
      ? "Paid"
      : profile?.feeStatus === "due"
        ? "Due"
        : "No invoice";

  return (
    <Dialog open={studentId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="pr-24">
          <DialogTitle>{profile?.fullName ?? "Student"}</DialogTitle>
          <DialogDescription>
            Class, fees, and amount due stay as they are.
          </DialogDescription>
        </DialogHeader>
        {editing ? (
          <div className="absolute top-2 right-12 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void onSave()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            className="absolute top-2 right-12"
            disabled={!profile}
            onClick={startEdit}
          >
            Edit
          </Button>
        )}

        {profile === undefined ? (
          <p className="text-sm text-muted-foreground">Loading student…</p>
        ) : profile === null ? (
          <p className="text-sm text-muted-foreground">Student not found.</p>
        ) : editing && draft ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Locked label="Class" value={profile.classLabel} />
            <Locked label="Fee" value={feeLabel} />
            <Locked label="Paid" value={money(profile.paid)} />
            <Locked label="Due" value={money(profile.due)} />
            <Locked
              label="Attendance"
              value={
                profile.attendancePercent === null
                  ? "No records"
                  : `${profile.attendancePercent}% (${profile.attendancePresent}/${profile.attendanceMarked} present)`
              }
            />
            <Field label="Admission number" required>
              <Input
                value={draft.admissionNumber}
                onChange={(event) =>
                  setDraft({ ...draft, admissionNumber: event.target.value })
                }
              />
            </Field>
            <Field label="Student name" required>
              <Input
                value={draft.fullName}
                onChange={(event) =>
                  setDraft({ ...draft, fullName: event.target.value })
                }
              />
            </Field>
            <Field label="Date of birth" required>
              <Input
                type="date"
                value={draft.dateOfBirth}
                onChange={(event) =>
                  setDraft({ ...draft, dateOfBirth: event.target.value })
                }
              />
            </Field>
            <Field label="Place of birth" required>
              <Input
                value={draft.placeOfBirth}
                onChange={(event) =>
                  setDraft({ ...draft, placeOfBirth: event.target.value })
                }
              />
            </Field>
            <Field label="Gender" required>
              <Select
                value={draft.gender}
                items={{ female: "Female", male: "Male", other: "Other" }}
                onValueChange={(value) => {
                  if (value === "female" || value === "male" || value === "other") {
                    setDraft({ ...draft, gender: value });
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Religion" required>
              <Input
                value={draft.religion}
                onChange={(event) =>
                  setDraft({ ...draft, religion: event.target.value })
                }
              />
            </Field>
            <Field label="Caste" required>
              <Input
                value={draft.caste}
                onChange={(event) =>
                  setDraft({ ...draft, caste: event.target.value })
                }
              />
            </Field>
            <Field label="Mother tongue" required>
              <Input
                value={draft.motherTongue}
                onChange={(event) =>
                  setDraft({ ...draft, motherTongue: event.target.value })
                }
              />
            </Field>
            <Field label="Social category" required className="md:col-span-2">
              <div className="flex flex-wrap gap-4">
                {SOCIAL.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={draft.socialCategory === value}
                      onChange={() =>
                        setDraft({ ...draft, socialCategory: value })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Student Aadhaar number" required>
              <Input
                inputMode="numeric"
                value={draft.aadhaarNumber}
                onChange={(event) =>
                  setDraft({ ...draft, aadhaarNumber: event.target.value })
                }
              />
            </Field>
            <Field label="Father name" required>
              <Input
                value={draft.guardianName}
                onChange={(event) =>
                  setDraft({ ...draft, guardianName: event.target.value })
                }
              />
            </Field>
            <Field label="Mother name" required>
              <Input
                value={draft.motherName}
                onChange={(event) =>
                  setDraft({ ...draft, motherName: event.target.value })
                }
              />
            </Field>
            <Field label="Father mobile" required>
              <Input
                inputMode="numeric"
                value={draft.guardianPhone}
                onChange={(event) =>
                  setDraft({ ...draft, guardianPhone: event.target.value })
                }
              />
            </Field>
            <Field label="Mother mobile" required>
              <Input
                inputMode="numeric"
                value={draft.motherPhone}
                onChange={(event) =>
                  setDraft({ ...draft, motherPhone: event.target.value })
                }
              />
            </Field>
            <Field label="Father's Aadhaar number" required>
              <Input
                inputMode="numeric"
                value={draft.fatherAadhaarNumber}
                onChange={(event) =>
                  setDraft({ ...draft, fatherAadhaarNumber: event.target.value })
                }
              />
            </Field>
            <Field label="Mother's Aadhaar number" required>
              <Input
                inputMode="numeric"
                value={draft.motherAadhaarNumber}
                onChange={(event) =>
                  setDraft({ ...draft, motherAadhaarNumber: event.target.value })
                }
              />
            </Field>
            <Field label="Email" required className="md:col-span-2">
              <Input
                type="email"
                value={draft.email}
                onChange={(event) =>
                  setDraft({ ...draft, email: event.target.value })
                }
              />
            </Field>
            <Field label="Residential address" required className="md:col-span-2">
              <Textarea
                value={draft.residentialAddress}
                onChange={(event) =>
                  setDraft({ ...draft, residentialAddress: event.target.value })
                }
              />
            </Field>
            <Field label="School transportation required" required className="md:col-span-2">
              <div className="flex gap-4">
                {(
                  [
                    ["yes", "Yes"],
                    ["no", "No"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={draft.transportRequired === value}
                      onChange={() =>
                        setDraft({ ...draft, transportRequired: value })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Previous school affiliation" required className="md:col-span-2">
              <div className="flex flex-wrap items-center gap-4">
                {AFFILIATIONS.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={draft.previousSchoolAffiliation === value}
                      onChange={() =>
                        setDraft({ ...draft, previousSchoolAffiliation: value })
                      }
                    />
                    {label}
                  </label>
                ))}
                {draft.previousSchoolAffiliation === "other" ? (
                  <Input
                    className="max-w-xs"
                    placeholder="Affiliation"
                    value={draft.previousSchoolOther}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        previousSchoolOther: event.target.value,
                      })
                    }
                  />
                ) : null}
              </div>
            </Field>
            <Field label="Previous school name" required className="md:col-span-2">
              <Input
                value={draft.previousSchoolName}
                onChange={(event) =>
                  setDraft({ ...draft, previousSchoolName: event.target.value })
                }
              />
            </Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label="Admission number" value={profile.admissionNumber} />
            <Detail label="Class" value={profile.classLabel} />
            <Detail label="Date of birth" value={profile.dateOfBirth} />
            <Detail label="Place of birth" value={text(profile.placeOfBirth)} />
            <Detail label="Gender" value={profile.gender} />
            <Detail label="Religion" value={text(profile.religion)} />
            <Detail label="Caste" value={text(profile.caste)} />
            <Detail label="Mother tongue" value={text(profile.motherTongue)} />
            <Detail
              label="Social category"
              value={
                SOCIAL.find(([value]) => value === profile.socialCategory)?.[1] ??
                "—"
              }
            />
            <Detail label="Aadhaar number" value={text(profile.aadhaarNumber)} />
            <Detail label="Father name" value={text(profile.guardianName)} />
            <Detail label="Mother name" value={text(profile.motherName)} />
            <Detail label="Father mobile" value={text(profile.guardianPhone)} />
            <Detail label="Mother mobile" value={text(profile.motherPhone)} />
            <Detail
              label="Father's Aadhaar number"
              value={text(profile.fatherAadhaarNumber)}
            />
            <Detail
              label="Mother's Aadhaar number"
              value={text(profile.motherAadhaarNumber)}
            />
            <Detail label="Email" value={text(profile.email)} />
            <Detail
              label="Residential address"
              value={text(profile.residentialAddress)}
            />
            <Detail
              label="School transportation"
              value={
                profile.transportRequired === undefined
                  ? "—"
                  : profile.transportRequired
                    ? "Yes"
                    : "No"
              }
            />
            <Detail
              label="Previous school affiliation"
              value={
                profile.previousSchoolAffiliation === "other"
                  ? text(profile.previousSchoolOther)
                  : (AFFILIATIONS.find(
                      ([value]) => value === profile.previousSchoolAffiliation,
                    )?.[1] ?? "—")
              }
            />
            <Detail
              label="Previous school name"
              value={text(profile.previousSchoolName)}
            />
            <Detail label="Fee" value={feeLabel} />
            <Detail label="Paid" value={money(profile.paid)} />
            <Detail label="Due" value={money(profile.due)} />
            <Detail
              label="Attendance"
              value={
                profile.attendancePercent === null
                  ? "No records"
                  : `${profile.attendancePercent}% (${profile.attendancePresent}/${profile.attendanceMarked} present)`
              }
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p>{value}</p>
    </div>
  );
}

function Locked({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="rounded-lg border bg-muted/40 px-2.5 py-1.5">{value}</p>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label>
        {label}
        {required ? <RequiredMark /> : null}
      </Label>
      {children}
    </div>
  );
}
