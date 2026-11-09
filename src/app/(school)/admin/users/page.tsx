"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { StaffProfileDialog } from "@/components/staff-profile-dialog";
import { canViewSchoolAdmin } from "@/lib/access";
import { teacherAccountSchema } from "@/lib/schemas";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type TeacherAccountInput = {
  name: string;
  email: string;
  phone: string;
  password: string;
};

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

function classLabel(classroom: { name: string; section: string }) {
  return `${classroom.name} ${classroom.section}`.trim();
}

function teacherDeleteMessage(name: string, classLabels: string[]) {
  return classLabels.length > 0
    ? `${name} has classes on the timetable (${classLabels.join(", ")}). Delete this teacher?`
    : `Delete ${name}?`;
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
      <PopoverTrigger className="flex h-8 w-48 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm">
        <span className="truncate">{summary}</span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2">
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {classes.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">
              No classes yet.
            </p>
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

const defaults: TeacherAccountInput = {
  name: "",
  email: "",
  phone: "",
  password: "",
};

function money(value: number) {
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function salaryDraft(value: number | undefined) {
  if (value === undefined) {
    return "";
  }
  return String(value);
}

function displayName(user: { name?: string; email?: string }) {
  return user.name?.trim() || user.email?.trim() || "Unnamed staff";
}

function EmploymentFields({
  userId,
  name,
  monthlySalary,
  joiningDate,
}: {
  userId: Id<"users">;
  name: string;
  monthlySalary?: number;
  joiningDate?: string;
}) {
  const save = useMutation(api.staff.setEmployment);
  const [date, setDate] = useState(joiningDate ?? "");
  const [salary, setSalary] = useState(salaryDraft(monthlySalary));
  const [saving, setSaving] = useState(false);
  const salaryNumber = salary.trim() === "" ? null : Number(salary);
  const salaryCents =
    salaryNumber === null ? null : Math.round(salaryNumber * 100);
  const salaryValid =
    salaryNumber !== null &&
    salaryCents !== null &&
    Number.isFinite(salaryNumber) &&
    salaryNumber >= 0 &&
    salaryNumber <= 10_000_000 &&
    Math.abs(salaryNumber * 100 - salaryCents) <= 1e-6;
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const unchanged =
    date === (joiningDate ?? "") && salary.trim() === salaryDraft(monthlySalary);
  const canSave = salaryValid && dateValid && !unchanged && !saving;

  async function onSave() {
    if (!canSave || salaryNumber === null) {
      return;
    }
    setSaving(true);
    try {
      await save({
        userId,
        monthlySalary: salaryNumber,
        joiningDate: date,
      });
      toast.success(`Saved employment for ${name}`);
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <TableCell>
        <Label htmlFor={`joining-${userId}`} className="sr-only">
          Joining date for {name}
        </Label>
        <Input
          id={`joining-${userId}`}
          type="date"
          className="w-40"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Label htmlFor={`salary-${userId}`} className="sr-only">
            Monthly salary for {name}
          </Label>
          <Input
            id={`salary-${userId}`}
            type="number"
            inputMode="decimal"
            min={0}
            max={10000000}
            step="0.01"
            className="w-32"
            placeholder="0.00"
            value={salary}
            onChange={(event) => setSalary(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={() => void onSave()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        {monthlySalary !== undefined ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {money(monthlySalary)} / month
          </p>
        ) : null}
      </TableCell>
    </>
  );
}

function StaffAdmin({
  onOpenProfile,
}: {
  onOpenProfile: (userId: Id<"users">) => void;
}) {
  const teachers = useQuery(api.users.listByRole, { role: "teacher" });
  const admins = useQuery(api.users.listByRole, { role: "super_admin" });
  const createTeacher = useAction(api.users.createTeacher);
  const setStatus = useMutation(api.users.setStatus);
  const assignStaffRole = useMutation(api.users.setStaffRole);
  const deleteTeacher = useMutation(api.users.deleteTeacher);
  const [deletingId, setDeletingId] = useState<Id<"users"> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    userId: Id<"users">;
    message: string;
  } | null>(null);
  const confirmArmedAt = useRef(0);
  const classes = useQuery(api.catalog.listClasses, {});
  const timetableClasses = useQuery(api.users.timetableClassesByTeacher, {});
  const timetableLabels = new Map(
    (timetableClasses ?? []).map((row) => [row.userId, row.classLabels]),
  );
  const [saving, setSaving] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole>("teacher");
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const [classIds, setClassIds] = useState<Id<"classes">[]>([]);
  const [joiningDate, setJoiningDate] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [search, setSearch] = useState("");
  const [openClassFor, setOpenClassFor] = useState<Id<"users"> | null>(null);
  const classItems = Object.fromEntries(
    (classes ?? []).map((classroom) => [
      classroom._id,
      `${classroom.name} ${classroom.section}`.trim(),
    ]),
  );
  const form = useForm<TeacherAccountInput>({
    resolver: zodResolver(teacherAccountSchema),
    defaultValues: defaults,
  });

  const people = useMemo(() => {
    const rows = [...(admins ?? []), ...(teachers ?? [])].sort((a, b) =>
      displayName(a).localeCompare(displayName(b)),
    );
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter((user) =>
      [user.name, user.email, user.phone, user.staffRole, user.role]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [admins, teachers, search]);
  const missingEmployment = [...(admins ?? []), ...(teachers ?? [])].filter(
    (user) => user.monthlySalary === undefined || !user.joiningDate,
  ).length;

  const onSubmit = form.handleSubmit(async (values) => {
    const signsIn = staffRole !== "driver" && staffRole !== "staff";
    if (signsIn) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
        toast.error("Enter a valid email");
        return;
      }
      if (values.password.length < 8) {
        toast.error("Password must be at least 8 characters");
        return;
      }
    }
    if (staffRole === "class_teacher" && !classId) {
      toast.error("Select a class for the class teacher");
      return;
    }
    if (staffRole === "incharge" && classIds.length === 0) {
      toast.error("Select at least one class for the incharge");
      return;
    }
    const salaryText = monthlySalary.trim();
    const hasEmployment = salaryText !== "" || joiningDate !== "";
    let salaryNumber: number | undefined;
    if (hasEmployment) {
      salaryNumber = Number(salaryText);
      const cents = Math.round(salaryNumber * 100);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate) ||
        !Number.isFinite(salaryNumber) ||
        salaryNumber < 0 ||
        salaryNumber > 10_000_000 ||
        Math.abs(salaryNumber * 100 - cents) > 1e-6
      ) {
        toast.error("Set a real joining date and a monthly salary with at most two decimal places");
        return;
      }
    }
    setSaving(true);
    try {
      await createTeacher({
        name: values.name,
        phone: values.phone,
        ...(signsIn
          ? { email: values.email, password: values.password }
          : {}),
        staffRole,
        ...(staffRole === "class_teacher" && classId ? { classId } : {}),
        ...(staffRole === "incharge" ? { classIds } : {}),
        ...(hasEmployment && salaryNumber !== undefined
          ? { monthlySalary: salaryNumber, joiningDate }
          : {}),
      });
      toast.success("Staff login created");
      form.reset(defaults);
      setStaffRole("teacher");
      setClassId("");
      setClassIds([]);
      setJoiningDate("");
      setMonthlySalary("");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-sm text-muted-foreground">
          Create sign-in accounts, assign roles, and set monthly salary and
          joining date.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add staff</CardTitle>
          <CardDescription>
            {staffRole === "driver" || staffRole === "staff"
              ? "Drivers and staff do not sign in. Phone, salary, and joining date are enough."
              : "The staff member signs in with this email and password. Salary and joining date can be set now or later in the list."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="teacher-name">Name</Label>
              <Input
                id="teacher-name"
                autoComplete="off"
                {...form.register("name")}
              />
              {form.formState.errors.name ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacher-role">Role</Label>
              <Select
                value={staffRole}
                items={STAFF_ROLES}
                onValueChange={(next) => {
                  if (!next || !isStaffRole(next)) {
                    return;
                  }
                  setStaffRole(next);
                  if (next !== "class_teacher") {
                    setClassId("");
                  }
                  if (next !== "incharge") {
                    setClassIds([]);
                  }
                }}
              >
                <SelectTrigger id="teacher-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="class_teacher">Class teacher</SelectItem>
                  <SelectItem value="data_entry">Data entry</SelectItem>
                  <SelectItem value="observer">Observer</SelectItem>
                  <SelectItem value="incharge">Incharge</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {staffRole === "driver" || staffRole === "staff" ? (
              <div className="space-y-2">
                <Label htmlFor="teacher-phone">Phone</Label>
                <Input
                  id="teacher-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="10-digit mobile"
                  {...form.register("phone")}
                />
                {form.formState.errors.phone ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.phone.message}
                  </p>
                ) : null}
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-4 md:col-span-2">
            <div className="space-y-2">
              <Label htmlFor="teacher-email">Email</Label>
              <Input
                id="teacher-email"
                type="email"
                autoComplete="off"
                {...form.register("email")}
              />
              {form.formState.errors.email ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.email.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacher-phone">Phone</Label>
              <Input
                id="teacher-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                placeholder="10-digit mobile"
                {...form.register("phone")}
              />
              {form.formState.errors.phone ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.phone.message}
                </p>
              ) : null}
            </div>
            </div>
            )}
            {staffRole === "driver" || staffRole === "staff" ? null : (
            <div className="space-y-2">
              <Label htmlFor="teacher-password">Password</Label>
              <Input
                id="teacher-password"
                type="password"
                autoComplete="new-password"
                {...form.register("password")}
              />
              {form.formState.errors.password ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.password.message}
                </p>
              ) : null}
            </div>
            )}
            {staffRole === "incharge" ? (
              <div className="space-y-2">
                <Label>Classes</Label>
                <ClassMultiSelect
                  classes={classes ?? []}
                  selected={classIds}
                  onChange={setClassIds}
                />
              </div>
            ) : null}
            {staffRole === "class_teacher" ? (
              <div className="space-y-2">
                <Label htmlFor="teacher-class">Class</Label>
                <Select
                  value={classId || null}
                  items={classItems}
                  onValueChange={(next) => {
                    if (next) {
                      setClassId(next as Id<"classes">);
                    }
                  }}
                >
                  <SelectTrigger id="teacher-class" className="w-full">
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
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="teacher-joining">Joining date</Label>
              <Input
                id="teacher-joining"
                type="date"
                value={joiningDate}
                onChange={(event) => setJoiningDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacher-salary">Monthly salary</Label>
              <Input
                id="teacher-salary"
                type="number"
                inputMode="decimal"
                min={0}
                max={10000000}
                step="0.01"
                placeholder="0.00"
                value={monthlySalary}
                onChange={(event) => setMonthlySalary(event.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Add staff"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
          <CardDescription>
            {missingEmployment === 0
              ? "Accounts, roles, monthly salary, and joining date."
              : `${missingEmployment} staff ${missingEmployment === 1 ? "member still needs" : "members still need"} a salary or joining date.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-full max-w-sm space-y-2">
            <Label htmlFor="staff-search">Search staff</Label>
            <Input
              id="staff-search"
              value={search}
              placeholder="Name, email, phone, or role"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {teachers === undefined || admins === undefined ? (
            <p className="text-sm text-muted-foreground">Loading staff…</p>
          ) : teachers.length === 0 && admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff accounts yet.</p>
          ) : people.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching staff.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Joining date</TableHead>
                  <TableHead>Monthly salary</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((user) => (
                  <TableRow key={user._id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => onOpenProfile(user._id)}
                      >
                        {displayName(user)}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span>{user.email ?? "—"}</span>
                        {user.phone ? (
                          <span className="text-muted-foreground">{user.phone}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <EmploymentFields
                      key={`${user._id}:${user.joiningDate ?? ""}:${user.monthlySalary ?? ""}`}
                      userId={user._id}
                      name={displayName(user)}
                      monthlySalary={user.monthlySalary}
                      joiningDate={user.joiningDate}
                    />
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{user.status}</Badge>
                        <Select
                          value={user.status}
                          items={{
                            active: "Active",
                            inactive: "Inactive",
                            suspended: "Suspended",
                          }}
                          onValueChange={(next) => {
                            if (
                              next === "active" ||
                              next === "inactive" ||
                              next === "suspended"
                            ) {
                              void setStatus({
                                userId: user._id,
                                status: next,
                              }).catch((error) =>
                                toast.error(mutationResult(error).message),
                              );
                            }
                          }}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.role === "teacher" ? (
                      <div className="flex items-center gap-2">
                        <Select
                          value={user.staffRole ?? "teacher"}
                          items={STAFF_ROLES}
                          onValueChange={(next) => {
                            if (!next || !isStaffRole(next)) {
                              return;
                            }
                            if (next === "class_teacher") {
                              setOpenClassFor(user._id);
                            } else {
                              setOpenClassFor(null);
                            }
                            void assignStaffRole({
                              userId: user._id,
                              staffRole: next,
                              ...(next === "class_teacher" && user.classId
                                ? { classId: user.classId }
                                : {}),
                              ...(next === "incharge"
                                ? { classIds: user.classIds ?? [] }
                                : {}),
                            }).catch((error) =>
                              toast.error(mutationResult(error).message),
                            );
                          }}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {signsInRole(user.staffRole) ? (
                              <>
                                <SelectItem value="teacher">Teacher</SelectItem>
                                <SelectItem value="class_teacher">
                                  Class teacher
                                </SelectItem>
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
                        {user.staffRole === "incharge" ? (
                          <ClassMultiSelect
                            classes={classes ?? []}
                            selected={user.classIds ?? []}
                            onChange={(next) => {
                              void assignStaffRole({
                                userId: user._id,
                                staffRole: "incharge",
                                classIds: next,
                              }).catch((error) =>
                                toast.error(mutationResult(error).message),
                              );
                            }}
                          />
                        ) : null}
                        {user.staffRole === "class_teacher" ? (
                          <Select
                            open={openClassFor === user._id}
                            onOpenChange={(open) =>
                              setOpenClassFor(open ? user._id : null)
                            }
                            value={user.classId ?? null}
                            items={classItems}
                            onValueChange={(next) => {
                              if (!next) return;
                              setOpenClassFor(null);
                              void assignStaffRole({
                                userId: user._id,
                                staffRole: "class_teacher",
                                classId: next as Id<"classes">,
                              }).catch((error) =>
                                toast.error(mutationResult(error).message),
                              );
                            }}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Select class" />
                            </SelectTrigger>
                            <SelectContent>
                              {(classes ?? []).map((classroom) => (
                                <SelectItem
                                  key={classroom._id}
                                  value={classroom._id}
                                >
                                  {classroom.name} {classroom.section}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </div>
                      ) : (
                        <span>Super admin</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.role === "teacher" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={
                          timetableClasses === undefined ||
                          deletingId === user._id
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (
                            timetableClasses === undefined ||
                            deletingId !== null
                          ) {
                            return;
                          }
                          const name =
                            user.name?.trim() || user.email || "this teacher";
                          const classLabels =
                            timetableLabels.get(user._id) ?? [];
                          confirmArmedAt.current = Date.now() + 400;
                          setPendingDelete({
                            userId: user._id,
                            message: teacherDeleteMessage(name, classLabels),
                          });
                        }}
                      >
                        Delete
                      </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && deletingId === null) {
            setPendingDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete staff</DialogTitle>
            <DialogDescription>
              {pendingDelete?.message ?? "Delete this staff member?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              autoFocus
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pendingDelete === null || deletingId !== null}
              onClick={() => {
                if (
                  !pendingDelete ||
                  deletingId !== null ||
                  Date.now() < confirmArmedAt.current
                ) {
                  return;
                }
                const userId = pendingDelete.userId;
                setDeletingId(userId);
                void deleteTeacher({ userId })
                  .then(() => {
                    toast.success("Staff member deleted");
                    setPendingDelete(null);
                  })
                  .catch((error) => {
                    toast.error(mutationResult(error).message);
                  })
                  .finally(() => {
                    setDeletingId(null);
                  });
              }}
            >
              {deletingId ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmploymentOnly({
  onOpenProfile,
  readOnly = false,
}: {
  onOpenProfile: (userId: Id<"users">) => void;
  readOnly?: boolean;
}) {
  const rows = useQuery(api.staff.list, {});
  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const list = rows ?? [];
    const query = search.trim().toLowerCase();
    if (!query) {
      return list;
    }
    return list.filter((row) =>
      [row.name, row.email, row.phone, row.roleLabel]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? "Staff accounts are read-only."
            : "Set each staff member's monthly salary and joining date."}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Employment</CardTitle>
          <CardDescription>
            Accounts and roles are managed by a super admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-full max-w-sm space-y-2">
            <Label htmlFor="staff-search">Search staff</Label>
            <Input
              id="staff-search"
              value={search}
              placeholder="Name, email, phone, or role"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {rows === undefined ? (
            <p className="text-sm text-muted-foreground">Loading staff…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff accounts yet.</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching staff.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joining date</TableHead>
                  <TableHead>Monthly salary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => onOpenProfile(row.userId)}
                      >
                        {row.name}
                      </button>
                      {row.email || row.phone ? (
                        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {row.email ? <span>{row.email}</span> : null}
                          {row.phone ? <span>{row.phone}</span> : null}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div>{row.roleLabel}</div>
                      {row.status !== "active" ? (
                        <Badge variant="secondary" className="mt-1 capitalize">
                          {row.status}
                        </Badge>
                      ) : null}
                    </TableCell>
                    {readOnly ? (
                      <>
                        <TableCell>{row.joiningDate ?? "—"}</TableCell>
                        <TableCell>
                          {row.monthlySalary === undefined
                            ? "—"
                            : row.monthlySalary.toLocaleString("en-IN", {
                                style: "currency",
                                currency: "INR",
                              })}
                        </TableCell>
                      </>
                    ) : (
                      <EmploymentFields
                        key={`${row.userId}:${row.joiningDate ?? ""}:${row.monthlySalary ?? ""}`}
                        userId={row.userId}
                        name={row.name}
                        monthlySalary={row.monthlySalary}
                        joiningDate={row.joiningDate}
                      />
                    )}
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

export default function StaffPage() {
  const me = useQuery(api.users.me);
  const [profileId, setProfileId] = useState<Id<"users"> | null>(null);
  const profile = (
    <StaffProfileDialog
      userId={profileId}
      onOpenChange={(open) => {
        if (!open) {
          setProfileId(null);
        }
      }}
    />
  );
  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading staff…</p>;
  }
  if (me === null) {
    return (
      <p className="text-sm text-destructive">
        Your account is not available. Sign in again.
      </p>
    );
  }
  if (me.role === "super_admin") {
    return (
      <>
        <StaffAdmin onOpenProfile={setProfileId} />
        {profile}
      </>
    );
  }
  if (me.staffRole === "data_entry") {
    return (
      <>
        <EmploymentOnly onOpenProfile={setProfileId} />
        {profile}
      </>
    );
  }
  if (canViewSchoolAdmin(me)) {
    return (
      <>
        <EmploymentOnly onOpenProfile={setProfileId} readOnly />
        {profile}
      </>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      Only super admins can manage staff.
    </p>
  );
}
