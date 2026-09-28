import { z } from "zod";

const optionalMobile = (label: string) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .refine(
      (value) => value === "" || /^[6-9]\d{9}$/.test(value),
      `Enter a 10-digit ${label}`,
    );

const optionalAadhaar = (label: string) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .refine(
      (value) => value === "" || /^\d{12}$/.test(value),
      `${label} must be 12 digits`,
    );

export const enrollStudentSchema = z
  .object({
    admissionNumber: z.string().trim(),
    fullName: z.string().trim().min(1, "Student name is required"),
    dateOfBirth: z
      .string()
      .refine(
        (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
        "Use YYYY-MM-DD",
      ),
    gender: z
      .string()
      .refine(
        (value) =>
          value === "" ||
          value === "female" ||
          value === "male" ||
          value === "other",
        "Select a gender",
      ),
    classId: z.string().min(1, "Class is required"),
    placeOfBirth: z.string().trim(),
    religion: z.string().trim(),
    caste: z.string().trim(),
    motherTongue: z.string().trim(),
    socialCategory: z
      .string()
      .refine(
        (value) =>
          value === "" || ["general", "obc", "sc", "st"].includes(value),
        "Select a social category",
      ),
    guardianName: z.string().trim().min(1, "Father name is required"),
    motherName: z.string().trim(),
    guardianPhone: z
      .string()
      .trim()
      .transform((value) => value.replace(/\D/g, ""))
      .pipe(
        z
          .string()
          .regex(/^[6-9]\d{9}$/, "Enter a 10-digit father mobile number"),
      ),
    motherPhone: optionalMobile("mother mobile number"),
    aadhaarNumber: optionalAadhaar("Aadhaar number"),
    fatherAadhaarNumber: optionalAadhaar("Father's Aadhaar number"),
    motherAadhaarNumber: optionalAadhaar("Mother's Aadhaar number"),
    email: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || z.string().email().safeParse(value).success,
        "Enter a valid email",
      ),
    residentialAddress: z.string().trim(),
    transportRequired: z
      .string()
      .refine(
        (value) => value === "" || value === "yes" || value === "no",
        "Select whether school transportation is required",
      ),
    previousSchoolAffiliation: z
      .string()
      .refine(
        (value) =>
          value === "" || ["state", "cbse", "icse", "other"].includes(value),
        "Select the previous school affiliation",
      ),
    previousSchoolOther: z.string().optional(),
    previousSchoolName: z.string().trim(),
    discountType: z.enum(["percent", "amount"]),
    discountValue: z.coerce.number().min(0, "Discount cannot be negative"),
    discountReason: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.discountValue <= 0) {
      return;
    }
    if (values.discountType === "percent" && values.discountValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Percent discount cannot exceed 100",
      });
    }
    if (!values.discountReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountReason"],
        message: "Describe why the discount is given",
      });
    }
    if (
      values.previousSchoolAffiliation === "other" &&
      !values.previousSchoolOther?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["previousSchoolOther"],
        message: "Enter the previous school affiliation",
      });
    }
  });

export const feeSchema = z.object({
  studentId: z.string().min(1, "Student is required"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  notes: z.string().optional(),
});

export const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
  role: z.enum(["teacher", "student", "parent"]).optional(),
});

export const teacherAccountSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type EnrollStudentInput = z.input<typeof enrollStudentSchema>;
export type FeeInput = z.infer<typeof feeSchema>;

export const extraFeeSchema = z.object({
  label: z.string().trim().min(1, "Fee label is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
});

export const classFormSchema = z.object({
  name: z.string().trim().min(1, "Class name is required"),
  section: z.string().trim().optional(),
  academicYear: z.string().trim().min(1, "Academic year is required"),
  tuitionCycle: z.enum(["monthly", "annual"]),
  baseTuitionFee: z.coerce.number().positive("Base tuition must be greater than 0"),
  extraFees: z.array(extraFeeSchema).max(20),
});

export const transportRouteSchema = z.object({
  name: z.string().trim().min(1, "Route name is required"),
  driverName: z.string().trim().min(1, "Driver name is required"),
  vehicleNumber: z.string().trim().min(1, "Vehicle number is required"),
  defaultFee: z.coerce.number().positive("Default fee must be greater than 0"),
});

export const customTransportFeeSchema = z.object({
  customFee: z.coerce.number().min(0, "Custom fee cannot be negative"),
  stopName: z.string().trim().optional(),
});

export type ClassFormInput = z.infer<typeof classFormSchema>;
export type TransportRouteInput = z.infer<typeof transportRouteSchema>;
