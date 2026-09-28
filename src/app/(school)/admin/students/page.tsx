"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { enrollStudentSchema, type EnrollStudentInput } from "@/lib/schemas";
import { mutationResult } from "@/lib/result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { usePaginatedQuery } from "convex/react";
import { Id } from "@convex/_generated/dataModel";

function RequiredMark() {
  return <span className="text-destructive"> *</span>;
}

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const enrollDefaults: EnrollStudentInput = {
  admissionNumber: "",
  fullName: "",
  dateOfBirth: "",
  gender: "",
  classId: "",
  placeOfBirth: "",
  religion: "",
  caste: "",
  motherTongue: "",
  socialCategory: "",
  guardianName: "",
  motherName: "",
  guardianPhone: "",
  motherPhone: "",
  aadhaarNumber: "",
  fatherAadhaarNumber: "",
  motherAadhaarNumber: "",
  email: "",
  residentialAddress: "",
  transportRequired: "",
  previousSchoolAffiliation: "",
  previousSchoolOther: "",
  previousSchoolName: "",
  discountType: "percent",
  discountValue: 0,
  discountReason: "",
};

export default function StudentsPage() {
  const classes = useQuery(api.catalog.listClasses);
  const seedDefaults = useMutation(api.catalog.seedDefaults);
  const enroll = useMutation(api.students.enroll);
  const { results, status, loadMore } = usePaginatedQuery(
    api.students.list,
    {},
    { initialNumItems: 20 },
  );

  const form = useForm<EnrollStudentInput>({
    resolver: zodResolver(enrollStudentSchema),
    defaultValues: enrollDefaults,
  });

  const classId = form.watch("classId");
  const discountType = form.watch("discountType");
  const discountValue = Number(form.watch("discountValue") || 0);
  const selectedClass = (classes ?? []).find(
    (classroom) => classroom._id === classId,
  );
  const cycleTotal = selectedClass
    ? (selectedClass.baseTuitionFee ?? 0) +
      (selectedClass.extraFees ?? []).reduce((sum, fee) => sum + fee.amount, 0)
    : 0;
  const monthlyFee =
    selectedClass?.tuitionCycle === "annual" ? cycleTotal / 12 : cycleTotal;
  const discountAmount =
    discountValue <= 0
      ? 0
      : discountType === "percent"
        ? (monthlyFee * discountValue) / 100
        : discountValue;
  const feeAfterDiscount = Math.max(0, monthlyFee - discountAmount);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const gender =
        values.gender === "female" ||
        values.gender === "male" ||
        values.gender === "other"
          ? values.gender
          : undefined;
      const socialCategory =
        values.socialCategory === "general" ||
        values.socialCategory === "obc" ||
        values.socialCategory === "sc" ||
        values.socialCategory === "st"
          ? values.socialCategory
          : undefined;
      const previousSchoolAffiliation =
        values.previousSchoolAffiliation === "state" ||
        values.previousSchoolAffiliation === "cbse" ||
        values.previousSchoolAffiliation === "icse" ||
        values.previousSchoolAffiliation === "other"
          ? values.previousSchoolAffiliation
          : undefined;
      await enroll({
        ...(values.admissionNumber.trim()
          ? { admissionNumber: values.admissionNumber.trim() }
          : {}),
        fullName: values.fullName,
        ...(values.dateOfBirth ? { dateOfBirth: values.dateOfBirth } : {}),
        ...(gender ? { gender } : {}),
        classId: values.classId as Id<"classes">,
        guardianName: values.guardianName,
        guardianPhone: values.guardianPhone,
        ...(values.aadhaarNumber
          ? { aadhaarNumber: values.aadhaarNumber }
          : {}),
        ...(values.placeOfBirth.trim()
          ? { placeOfBirth: values.placeOfBirth }
          : {}),
        ...(values.religion.trim() ? { religion: values.religion } : {}),
        ...(values.caste.trim() ? { caste: values.caste } : {}),
        ...(values.motherTongue.trim()
          ? { motherTongue: values.motherTongue }
          : {}),
        ...(socialCategory ? { socialCategory } : {}),
        ...(values.motherName.trim() ? { motherName: values.motherName } : {}),
        ...(values.fatherAadhaarNumber
          ? { fatherAadhaarNumber: values.fatherAadhaarNumber }
          : {}),
        ...(values.motherAadhaarNumber
          ? { motherAadhaarNumber: values.motherAadhaarNumber }
          : {}),
        ...(values.motherPhone ? { motherPhone: values.motherPhone } : {}),
        ...(values.email.trim() ? { email: values.email } : {}),
        ...(values.residentialAddress.trim()
          ? { residentialAddress: values.residentialAddress }
          : {}),
        ...(values.transportRequired === "yes" ||
        values.transportRequired === "no"
          ? { transportRequired: values.transportRequired === "yes" }
          : {}),
        ...(previousSchoolAffiliation
          ? { previousSchoolAffiliation }
          : {}),
        ...(previousSchoolAffiliation === "other"
          ? { previousSchoolOther: values.previousSchoolOther }
          : {}),
        ...(values.previousSchoolName.trim()
          ? { previousSchoolName: values.previousSchoolName }
          : {}),
        discountType: values.discountType,
        discountValue: values.discountValue,
        ...(values.discountReason?.trim()
          ? { discountReason: values.discountReason }
          : {}),
      });
      toast.success("Student enrolled");
      form.reset(enrollDefaults);
    } catch (error) {
      toast.error(mutationResult(error).message);
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admissions</h1>
        <p className="text-sm text-muted-foreground">
          Enroll students and review the live roster.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enroll student</CardTitle>
          <CardDescription>
            Student name, class, father name, and father mobile are required. Every other field is optional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
            <h2 className="text-sm font-semibold tracking-wide text-primary md:col-span-2">
              Student information
            </h2>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="fullName">
                Student name
                <RequiredMark />
              </Label>
              <Input id="fullName" {...form.register("fullName")} />
              {form.formState.errors.fullName ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.fullName.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">
                Date of birth
              </Label>
              <Input id="dateOfBirth" type="date" {...form.register("dateOfBirth")} />
              {form.formState.errors.dateOfBirth ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.dateOfBirth.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="placeOfBirth">
                Place of birth
              </Label>
              <Input id="placeOfBirth" {...form.register("placeOfBirth")} />
              {form.formState.errors.placeOfBirth ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.placeOfBirth.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>
                Gender
              </Label>
              <Select
                value={form.watch("gender") || null}
                items={{
                  female: "Female",
                  male: "Male",
                  other: "Other",
                }}
                onValueChange={(value) => {
                  if (value === "female" || value === "male" || value === "other") {
                    form.setValue("gender", value);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="religion">
                Religion
              </Label>
              <Input id="religion" {...form.register("religion")} />
              {form.formState.errors.religion ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.religion.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="caste">
                Caste
              </Label>
              <Input id="caste" {...form.register("caste")} />
              {form.formState.errors.caste ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.caste.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="motherTongue">
                Mother tongue
              </Label>
              <Input id="motherTongue" {...form.register("motherTongue")} />
              {form.formState.errors.motherTongue ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.motherTongue.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>
                Social category
              </Label>
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ["general", "General"],
                    ["obc", "OBC"],
                    ["sc", "SC"],
                    ["st", "ST"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="socialCategory"
                      checked={form.watch("socialCategory") === value}
                      onChange={() =>
                        form.setValue("socialCategory", value, {
                          shouldValidate: true,
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              {form.formState.errors.socialCategory ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.socialCategory.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="aadhaarNumber">
                Student Aadhaar number
              </Label>
              <Input
                id="aadhaarNumber"
                inputMode="numeric"
                autoComplete="off"
                placeholder="12 digits"
                {...form.register("aadhaarNumber")}
              />
              {form.formState.errors.aadhaarNumber ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.aadhaarNumber.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="admissionNumber">
                Admission number
              </Label>
              <Input id="admissionNumber" {...form.register("admissionNumber")} />
              {form.formState.errors.admissionNumber ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.admissionNumber.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>
                Class
                <RequiredMark />
              </Label>
              <Select
                value={form.watch("classId") || null}
                items={Object.fromEntries(
                  (classes ?? []).map((classroom) => [
                    classroom._id,
                    `${classroom.name} ${classroom.section}`.trim(),
                  ]),
                )}
                onValueChange={(value) => {
                  if (value) form.setValue("classId", value);
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
              {form.formState.errors.classId ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.classId.message}
                </p>
              ) : null}
            </div>
            {selectedClass ? (
              <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Monthly fee</Label>
                  <div className="flex h-8 items-center rounded-lg border px-2.5 text-sm">
                    {money(monthlyFee)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedClass.tuitionCycle === "annual"
                      ? `Annual class fee ${money(cycleTotal)}, shown as a monthly amount.`
                      : "Tuition plus extra class fees."}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discountValue">Discount</Label>
                  <div className="flex gap-2">
                    <Select
                      value={discountType}
                      items={{ percent: "%", amount: "Amount" }}
                      onValueChange={(value) => {
                        if (value === "percent" || value === "amount") {
                          form.setValue("discountType", value);
                        }
                      }}
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">%</SelectItem>
                        <SelectItem value="amount">Amount</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      id="discountValue"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={discountType === "percent" ? "0" : "0.00"}
                      {...form.register("discountValue")}
                    />
                  </div>
                  {form.formState.errors.discountValue ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.discountValue.message}
                    </p>
                  ) : null}
                </div>
                {discountValue > 0 ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="discountReason">
                      Discount reason
                      <RequiredMark />
                    </Label>
                    <Textarea
                      id="discountReason"
                      placeholder="Why is this discount being given?"
                      {...form.register("discountReason")}
                    />
                    {form.formState.errors.discountReason ? (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.discountReason.message}
                      </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      Monthly fee after discount: {money(feeAfterDiscount)}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <h2 className="mt-2 text-sm font-semibold tracking-wide text-primary md:col-span-2">
              Parent information
            </h2>
            <div className="space-y-2">
              <Label htmlFor="guardianName">
                Father name
                <RequiredMark />
              </Label>
              <Input id="guardianName" {...form.register("guardianName")} />
              {form.formState.errors.guardianName ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.guardianName.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="motherName">
                Mother name
              </Label>
              <Input id="motherName" {...form.register("motherName")} />
              {form.formState.errors.motherName ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.motherName.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fatherAadhaarNumber">
                Father&apos;s Aadhaar number
              </Label>
              <Input
                id="fatherAadhaarNumber"
                inputMode="numeric"
                autoComplete="off"
                placeholder="12 digits"
                {...form.register("fatherAadhaarNumber")}
              />
              {form.formState.errors.fatherAadhaarNumber ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.fatherAadhaarNumber.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="motherAadhaarNumber">
                Mother&apos;s Aadhaar number
              </Label>
              <Input
                id="motherAadhaarNumber"
                inputMode="numeric"
                autoComplete="off"
                placeholder="12 digits"
                {...form.register("motherAadhaarNumber")}
              />
              {form.formState.errors.motherAadhaarNumber ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.motherAadhaarNumber.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="guardianPhone">
                Father mobile
                <RequiredMark />
              </Label>
              <Input
                id="guardianPhone"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="10-digit mobile number"
                {...form.register("guardianPhone")}
              />
              {form.formState.errors.guardianPhone ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.guardianPhone.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="motherPhone">
                Mother mobile
              </Label>
              <Input
                id="motherPhone"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="10-digit mobile number"
                {...form.register("motherPhone")}
              />
              {form.formState.errors.motherPhone ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.motherPhone.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="email">
                Email
              </Label>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.email.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="residentialAddress">
                Residential address
              </Label>
              <Textarea id="residentialAddress" {...form.register("residentialAddress")} />
              {form.formState.errors.residentialAddress ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.residentialAddress.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>
                School transportation required
              </Label>
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
                      name="transportRequired"
                      checked={form.watch("transportRequired") === value}
                      onChange={() =>
                        form.setValue("transportRequired", value, {
                          shouldValidate: true,
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              {form.formState.errors.transportRequired ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.transportRequired.message}
                </p>
              ) : null}
            </div>
            <h2 className="mt-2 text-sm font-semibold tracking-wide text-primary md:col-span-2">
              Previous school details
            </h2>
            <div className="space-y-2 md:col-span-2">
              <Label>
                Previous school affiliation
              </Label>
              <div className="flex flex-wrap items-center gap-4">
                {(
                  [
                    ["state", "State"],
                    ["cbse", "CBSE"],
                    ["icse", "ICSE"],
                    ["other", "Other"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="previousSchoolAffiliation"
                      checked={form.watch("previousSchoolAffiliation") === value}
                      onChange={() =>
                        form.setValue("previousSchoolAffiliation", value, {
                          shouldValidate: true,
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
                {form.watch("previousSchoolAffiliation") === "other" ? (
                  <label
                    htmlFor="previousSchoolOther"
                    className="flex items-center gap-2 text-sm"
                  >
                    <RequiredMark />
                    <Input
                      id="previousSchoolOther"
                      className="max-w-xs"
                      placeholder="Affiliation"
                      {...form.register("previousSchoolOther")}
                    />
                  </label>
                ) : null}
              </div>
              {form.formState.errors.previousSchoolAffiliation ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.previousSchoolAffiliation.message}
                </p>
              ) : null}
              {form.formState.errors.previousSchoolOther ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.previousSchoolOther.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="previousSchoolName">
                Previous school name
              </Label>
              <Input id="previousSchoolName" {...form.register("previousSchoolName")} />
              {form.formState.errors.previousSchoolName ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.previousSchoolName.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Enroll student"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    const result = await seedDefaults({});
                    toast.success(
                      `Catalog ready (${result.classCount} classes, ${result.subjectCount} subjects)`,
                    );
                  } catch (error) {
                    toast.error(mutationResult(error).message);
                  }
                }}
              >
                Seed sample classes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enrolled students</CardTitle>
        </CardHeader>
        <CardContent>
          {results === undefined ? (
            <p className="text-sm text-muted-foreground">Loading students…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No students yet. Enroll the first student above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>DOB</TableHead>
                  <TableHead>Father</TableHead>
                  <TableHead>Father mobile</TableHead>
                  <TableHead>Aadhaar</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((student) => (
                  <TableRow key={student._id}>
                    <TableCell>{student.admissionNumber}</TableCell>
                    <TableCell>{student.name}</TableCell>
                    <TableCell>{student.classLabel}</TableCell>
                    <TableCell>{student.dateOfBirth ?? "—"}</TableCell>
                    <TableCell>{student.guardianName ?? "—"}</TableCell>
                    <TableCell>{student.guardianPhone ?? "—"}</TableCell>
                    <TableCell>{student.aadhaarNumber ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{student.status}</Badge>
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
              onClick={() => loadMore(20)}
            >
              Load more
            </Button>
          ) : null}
          {status === "LoadingMore" ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading more…</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
