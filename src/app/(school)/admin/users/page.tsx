"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
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
  password: string;
};

const STAFF_ROLES = {
  teacher: "Teacher",
  class_teacher: "Class teacher",
  data_entry: "Data entry",
  incharge: "Incharge",
} as const;

type StaffRole = keyof typeof STAFF_ROLES;

function isStaffRole(value: string | null): value is StaffRole {
  return (
    value === "teacher" ||
    value === "class_teacher" ||
    value === "data_entry" ||
    value === "incharge"
  );
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
  password: "",
};

export default function TeachersPage() {
  const me = useQuery(api.users.me);
  const isSuperAdmin = me?.role === "super_admin";
  const { results, status, loadMore } = usePaginatedQuery(
    api.users.list,
    isSuperAdmin ? { role: "teacher" } : "skip",
    { initialNumItems: 20 },
  );
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
  const classes = useQuery(
    api.catalog.listClasses,
    isSuperAdmin ? {} : "skip",
  );
  const timetableClasses = useQuery(
    api.users.timetableClassesByTeacher,
    isSuperAdmin ? {} : "skip",
  );
  const timetableLabels = new Map(
    (timetableClasses ?? []).map((row) => [row.userId, row.classLabels]),
  );
  const [saving, setSaving] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole>("teacher");
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const [classIds, setClassIds] = useState<Id<"classes">[]>([]);
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

  if (me && !isSuperAdmin) {
    return (
      <p className="text-sm text-muted-foreground">
        Only super admins can open the teachers page.
      </p>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (staffRole === "class_teacher" && !classId) {
      toast.error("Select a class for the class teacher");
      return;
    }
    if (staffRole === "incharge" && classIds.length === 0) {
      toast.error("Select at least one class for the incharge");
      return;
    }
    setSaving(true);
    try {
      await createTeacher({
        ...values,
        staffRole,
        ...(staffRole === "class_teacher" && classId ? { classId } : {}),
        ...(staffRole === "incharge" ? { classIds } : {}),
      });
      toast.success("Teacher login created");
      form.reset(defaults);
      setStaffRole("teacher");
      setClassId("");
      setClassIds([]);
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Teachers</h1>
        <p className="text-sm text-muted-foreground">
          Create the email and password a teacher uses to sign in.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add teacher</CardTitle>
          <CardDescription>
            The teacher signs in with this email and password.
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
                  <SelectItem value="incharge">Incharge</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Add teacher"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teacher logins</CardTitle>
          <CardDescription>
            Teachers who can sign in to the school.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {results === undefined ? (
            <p className="text-sm text-muted-foreground">Loading teachers…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No teacher logins yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((user) => (
                  <TableRow key={user._id}>
                    <TableCell>{user.name ?? "—"}</TableCell>
                    <TableCell>{user.email ?? "—"}</TableCell>
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
                            <SelectItem value="teacher">Teacher</SelectItem>
                            <SelectItem value="class_teacher">
                              Class teacher
                            </SelectItem>
                            <SelectItem value="data_entry">Data entry</SelectItem>
                            <SelectItem value="incharge">Incharge</SelectItem>
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
                    </TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {status === "CanLoadMore" ? (
            <Button
              className="mt-4"
              variant="outline"
              type="button"
              onClick={() => loadMore(20)}
            >
              Load more
            </Button>
          ) : null}
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
            <DialogTitle>Delete teacher</DialogTitle>
            <DialogDescription>
              {pendingDelete?.message ?? "Delete this teacher?"}
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
                    toast.success("Teacher deleted");
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
