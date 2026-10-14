"use client";

import { useState } from "react";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
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

type TeacherAccountInput = {
  name: string;
  email: string;
  password: string;
};

const STAFF_ROLES = {
  teacher: "Teacher",
  class_teacher: "Class teacher",
  data_entry: "Data entry",
} as const;

type StaffRole = keyof typeof STAFF_ROLES;

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
  const classes = useQuery(
    api.catalog.listClasses,
    isSuperAdmin ? {} : "skip",
  );
  const [saving, setSaving] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole>("teacher");
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
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
    setSaving(true);
    try {
      await createTeacher({
        ...values,
        staffRole,
        ...(staffRole === "class_teacher" && classId ? { classId } : {}),
      });
      toast.success("Teacher login created");
      form.reset(defaults);
      setStaffRole("teacher");
      setClassId("");
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
                  if (
                    next === "teacher" ||
                    next === "class_teacher" ||
                    next === "data_entry"
                  ) {
                    setStaffRole(next);
                    if (next !== "class_teacher") {
                      setClassId("");
                    }
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
                </SelectContent>
              </Select>
            </div>
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
                            if (
                              next !== "teacher" &&
                              next !== "class_teacher" &&
                              next !== "data_entry"
                            ) {
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
                          </SelectContent>
                        </Select>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {status === "CanLoadMore" ? (
            <Button className="mt-4" variant="outline" onClick={() => loadMore(20)}>
              Load more
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
