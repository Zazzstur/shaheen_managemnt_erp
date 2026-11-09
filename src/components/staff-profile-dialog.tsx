"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { isSchoolAdmin } from "@/lib/access";
import { mutationResult } from "@/lib/result";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STAFF_ROLES = {
  teacher: "Teacher",
  class_teacher: "Class teacher",
  data_entry: "Data entry",
  observer: "Observer",
  incharge: "Incharge",
  driver: "Driver",
  staff: "Staff",
} as const;

type StaffRole = keyof typeof STAFF_ROLES;

function isStaffRole(value: string | null): value is StaffRole {
  return (
    value === "teacher" ||
    value === "class_teacher" ||
    value === "data_entry" ||
    value === "observer" ||
    value === "incharge" ||
    value === "driver" ||
    value === "staff"
  );
}

function signsInRole(role: string | undefined) {
  return role !== "driver" && role !== "staff";
}

function money(value: number) {
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function text(value: string | undefined) {
  return value && value.trim() ? value : "—";
}

function classLabel(classroom: { name: string; section: string }) {
  return `${classroom.name} ${classroom.section}`.trim();
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function ClassMultiSelect({
  classes,
  selected,
  onChange,
}: {
  classes: Array<{ _id: Id<"classes">; name: string; section: string }>;
  selected: Id<"classes">[];
  onChange: (next: Id<"classes">[]) => void;
}) {
  const labels = classes
    .filter((classroom) => selected.includes(classroom._id))
    .map(classLabel);
  const summary =
    labels.length === 0
      ? "Select classes"
      : labels.length <= 2
        ? labels.join(", ")
        : `${labels.length} classes`;
  return (
    <Popover>
      <PopoverTrigger className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm">
        <span className="truncate">{summary}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2">
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {classes.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">No classes yet.</p>
          ) : (
            classes.map((classroom) => {
              const checked = selected.includes(classroom._id);
              return (
                <label
                  key={classroom._id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => {
                      const on = value === true;
                      onChange(
                        on
                          ? [...selected, classroom._id]
                          : selected.filter((id) => id !== classroom._id),
                      );
                    }}
                  />
                  <span>{classLabel(classroom)}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function StaffProfileDialog({
  userId,
  onOpenChange,
}: {
  userId: Id<"users"> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const me = useQuery(api.users.me);
  const profile = useQuery(api.staff.profile, userId ? { userId } : "skip");
  const classes = useQuery(
    api.catalog.listClasses,
    me?.role === "super_admin" ? {} : "skip",
  );
  const updateProfile = useMutation(api.staff.updateProfile);
  const canManageAccount = me?.role === "super_admin";
  const canEditProfile = me ? isSchoolAdmin(me) : false;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "suspended">("active");
  const [staffRole, setStaffRole] = useState<StaffRole>("teacher");
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const [classIds, setClassIds] = useState<Id<"classes">[]>([]);
  const [joiningDate, setJoiningDate] = useState("");
  const [salary, setSalary] = useState("");

  useEffect(() => {
    setEditing(false);
  }, [userId]);

  function startEdit() {
    if (!profile) {
      return;
    }
    setName(profile.name);
    setPhone(profile.phone ?? "");
    setStatus(profile.status);
    setStaffRole(profile.staffRole ?? "teacher");
    setClassId(profile.classId ?? "");
    setClassIds(profile.classIds ?? []);
    setJoiningDate(profile.joiningDate ?? "");
    setSalary(profile.monthlySalary === undefined ? "" : String(profile.monthlySalary));
    setEditing(true);
  }

  async function onSave() {
    if (!userId || !profile) {
      return;
    }
    const salaryText = salary.trim();
    const salaryNumber = salaryText === "" ? undefined : Number(salaryText);
    if (salaryNumber !== undefined) {
      const cents = Math.round(salaryNumber * 100);
      if (
        !Number.isFinite(salaryNumber) ||
        salaryNumber < 0 ||
        salaryNumber > 10_000_000 ||
        Math.abs(salaryNumber * 100 - cents) > 1e-6
      ) {
        toast.error("Monthly salary can have at most two decimal places");
        return;
      }
    }
    if ((salaryNumber === undefined) !== (joiningDate === "")) {
      toast.error("Set both monthly salary and joining date, or leave both empty");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        userId,
        name,
        phone,
        ...(canManageAccount ? { status } : {}),
        ...(canManageAccount && profile.role === "teacher"
          ? {
              staffRole,
              ...(staffRole === "class_teacher" && classId ? { classId } : {}),
              ...(staffRole === "incharge" ? { classIds } : {}),
            }
          : {}),
        ...(salaryNumber !== undefined && joiningDate
          ? { monthlySalary: salaryNumber, joiningDate }
          : {}),
      });
      toast.success("Staff profile saved");
      setEditing(false);
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  const classItems = Object.fromEntries(
    (classes ?? []).map((classroom) => [classroom._id, classLabel(classroom)]),
  );

  return (
    <Dialog open={userId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="pr-24">
          <DialogTitle>{profile?.name ?? "Staff"}</DialogTitle>
          <DialogDescription>Profile and employment.</DialogDescription>
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
            <Button type="button" size="sm" disabled={saving} onClick={() => void onSave()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : (
          canEditProfile ? (
          <Button
            type="button"
            size="sm"
            className="absolute top-2 right-12"
            disabled={!profile}
            onClick={startEdit}
          >
            Edit
          </Button>
          ) : null
        )}
        {profile === undefined ? (
          <p className="text-sm text-muted-foreground">Loading profile…</p>
        ) : editing ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                disabled={!canManageAccount}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <p className="flex h-8 items-center text-sm">{text(profile.email)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                type="tel"
                inputMode="numeric"
                placeholder="10-digit mobile"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            {canManageAccount ? (
              <div className="space-y-2">
                <Label htmlFor="profile-status">Status</Label>
                <Select
                  value={status}
                  items={{ active: "Active", inactive: "Inactive", suspended: "Suspended" }}
                  onValueChange={(next) => {
                    if (next === "active" || next === "inactive" || next === "suspended") {
                      setStatus(next);
                    }
                  }}
                >
                  <SelectTrigger id="profile-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Detail label="Status" value={profile.status} />
            )}
            {canManageAccount && profile.role === "teacher" ? (
              <div className="space-y-2">
                <Label htmlFor="profile-role">Role</Label>
                <Select
                  value={staffRole}
                  items={STAFF_ROLES}
                  onValueChange={(next) => {
                    if (!next || !isStaffRole(next)) {
                      return;
                    }
                    setStaffRole(next);
                  }}
                >
                  <SelectTrigger id="profile-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {signsInRole(profile.staffRole) ? (
                      <>
                        <SelectItem value="teacher">Teacher</SelectItem>
                        <SelectItem value="class_teacher">Class teacher</SelectItem>
                        <SelectItem value="data_entry">Data entry</SelectItem>
                        <SelectItem value="observer">Observer</SelectItem>
                        <SelectItem value="incharge">Incharge</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="driver">Driver</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Detail label="Role" value={profile.roleLabel} />
            )}
            {canManageAccount && profile.role === "teacher" && staffRole === "class_teacher" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="profile-class">Class</Label>
                <Select
                  value={classId || null}
                  items={classItems}
                  onValueChange={(next) => {
                    if (next) {
                      setClassId(next as Id<"classes">);
                    }
                  }}
                >
                  <SelectTrigger id="profile-class" className="w-full">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {(classes ?? []).map((classroom) => (
                      <SelectItem key={classroom._id} value={classroom._id}>
                        {classLabel(classroom)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {canManageAccount && profile.role === "teacher" && staffRole === "incharge" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label>Classes</Label>
                <ClassMultiSelect
                  classes={classes ?? []}
                  selected={classIds}
                  onChange={setClassIds}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="profile-joining">Joining date</Label>
              <Input
                id="profile-joining"
                type="date"
                value={joiningDate}
                onChange={(event) => setJoiningDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-salary">Monthly salary</Label>
              <Input
                id="profile-salary"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={salary}
                onChange={(event) => setSalary(event.target.value)}
              />
            </div>
          </div>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Email" value={text(profile.email)} />
            <Detail label="Phone" value={text(profile.phone)} />
            <Detail label="Role" value={profile.roleLabel} />
            <Detail label="Status" value={profile.status} />
            <Detail
              label="Class"
              value={profile.classLabels.length > 0 ? profile.classLabels.join(", ") : "—"}
            />
            <Detail label="Joining date" value={text(profile.joiningDate)} />
            <Detail
              label="Monthly salary"
              value={
                profile.monthlySalary === undefined ? "—" : money(profile.monthlySalary)
              }
            />
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
