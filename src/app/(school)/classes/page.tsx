"use client";

import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { classFormSchema, type ClassFormInput } from "@/lib/schemas";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const emptyForm: ClassFormInput = {
  name: "",
  section: "",
  academicYear: "2026-2027",
  tuitionCycle: "monthly",
  baseTuitionFee: 0,
  extraFees: [],
};

function money(value: number) {
  return value.toFixed(2);
}

export default function ClassesPage() {
  const me = useQuery(api.users.me);
  const classes = useQuery(api.classes.listWithStats);
  const createClass = useMutation(api.classes.create);
  const updateClass = useMutation(api.classes.update);
  const removeClass = useMutation(api.classes.remove);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"classes"> | null>(null);

  const form = useForm<ClassFormInput>({
    resolver: zodResolver(classFormSchema),
    defaultValues: emptyForm,
  });
  const extraFees = useFieldArray({ control: form.control, name: "extraFees" });
  const watched = form.watch();
  const totalFee = useMemo(() => {
    const extras = (watched.extraFees ?? []).reduce(
      (sum, fee) => sum + Number(fee.amount || 0),
      0,
    );
    return Number(watched.baseTuitionFee || 0) + extras;
  }, [watched.baseTuitionFee, watched.extraFees]);

  useEffect(() => {
    if (!open) {
      form.reset(emptyForm);
      setEditingId(null);
    }
  }, [open, form]);

  if (me && me.role !== "super_admin") {
    return (
      <p className="text-sm text-muted-foreground">
        Only super admins can manage classes and fee structures.
      </p>
    );
  }

  const openCreate = () => {
    form.reset(emptyForm);
    setEditingId(null);
    setOpen(true);
  };

  const openEdit = (classroom: NonNullable<typeof classes>[number]) => {
    form.reset({
      name: classroom.name,
      section: classroom.section,
      academicYear: classroom.academicYear,
      tuitionCycle: classroom.tuitionCycle,
      baseTuitionFee: classroom.baseTuitionFee || 0,
      extraFees: classroom.extraFees,
    });
    setEditingId(classroom._id);
    setOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const payload = {
        name: values.name,
        section: values.section,
        academicYear: values.academicYear,
        tuitionCycle: values.tuitionCycle,
        baseTuitionFee: values.baseTuitionFee,
        extraFees: values.extraFees,
      };
      if (editingId) {
        await updateClass({ classId: editingId, ...payload });
        toast.success("Class updated");
      } else {
        await createClass(payload);
        toast.success("Class created");
      }
      setOpen(false);
    } catch (error) {
      toast.error(mutationResult(error).message);
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Classes</h1>
          <p className="text-sm text-muted-foreground">
            Create classes and configure the standard fee structure.
          </p>
        </div>
        <Button onClick={openCreate}>Create class</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class list</CardTitle>
          <CardDescription>
            Enrollment counts and total fees update as you save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {classes === undefined ? (
            <p className="text-sm text-muted-foreground">Loading classes…</p>
          ) : classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No classes yet. Create the first class.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class name</TableHead>
                  <TableHead>Section / grade</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead>Base tuition</TableHead>
                  <TableHead>Total class fee</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.map((classroom) => (
                  <TableRow key={classroom._id}>
                    <TableCell>
                      <div className="font-medium">{classroom.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {classroom.academicYear}
                      </div>
                    </TableCell>
                    <TableCell>{classroom.section || "—"}</TableCell>
                    <TableCell>{classroom.enrolledCount}</TableCell>
                    <TableCell>
                      {money(classroom.baseTuitionFee)}{" "}
                      <Badge variant="secondary">{classroom.tuitionCycle}</Badge>
                    </TableCell>
                    <TableCell>{money(classroom.totalClassFee)}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(classroom)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Delete ${classroom.name} ${classroom.section}?`,
                            )
                          ) {
                            return;
                          }
                          try {
                            await removeClass({ classId: classroom._id });
                            toast.success("Class deleted");
                          } catch (error) {
                            toast.error(mutationResult(error).message);
                          }
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
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit class" : "Create class"}
            </DialogTitle>
            <DialogDescription>
              Set the class identity and the fees charged to every student in it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Class name</Label>
              <Input
                id="name"
                placeholder="Class 10"
                {...form.register("name")}
              />
              {form.formState.errors.name ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="section">Section / stream (optional)</Label>
                <Input
                  id="section"
                  placeholder="A or Science"
                  {...form.register("section")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="academicYear">Academic year</Label>
                <Input
                  id="academicYear"
                  placeholder="2026-2027"
                  {...form.register("academicYear")}
                />
                {form.formState.errors.academicYear ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.academicYear.message}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fee cycle</Label>
                <Select
                  value={form.watch("tuitionCycle")}
                  items={{ monthly: "Monthly", annual: "Annual" }}
                  onValueChange={(value) => {
                    if (value === "monthly" || value === "annual") {
                      form.setValue("tuitionCycle", value);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Cycle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="baseTuitionFee">Base tuition fee</Label>
                <Input
                  id="baseTuitionFee"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register("baseTuitionFee")}
                />
                {form.formState.errors.baseTuitionFee ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.baseTuitionFee.message}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Extra fee components</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => extraFees.append({ label: "", amount: 0 })}
                >
                  <Plus className="size-3.5" />
                  Add fee
                </Button>
              </div>
              {extraFees.fields.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Optional items such as library, lab, or sports fees.
                </p>
              ) : (
                extraFees.fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2">
                    <Input
                      placeholder="Library fee"
                      {...form.register(`extraFees.${index}.label`)}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-28"
                      {...form.register(`extraFees.${index}.amount`)}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => extraFees.remove(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
            <p className="text-sm font-medium">
              Total class fee: {money(totalFee)}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save class"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
