"use client";

import { useState } from "react";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@convex/_generated/api";
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

const defaults: TeacherAccountInput = {
  name: "",
  email: "",
  password: "",
};

export default function TeachersPage() {
  const me = useQuery(api.users.me);
  const { results, status, loadMore } = usePaginatedQuery(
    api.users.list,
    { role: "teacher" },
    { initialNumItems: 20 },
  );
  const createTeacher = useAction(api.users.createTeacher);
  const setStatus = useMutation(api.users.setStatus);
  const [saving, setSaving] = useState(false);
  const form = useForm<TeacherAccountInput>({
    resolver: zodResolver(teacherAccountSchema),
    defaultValues: defaults,
  });

  if (me && me.role !== "super_admin") {
    return (
      <p className="text-sm text-muted-foreground">
        Only super admins can add teacher logins.
      </p>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      await createTeacher(values);
      toast.success("Teacher login created");
      form.reset(defaults);
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
