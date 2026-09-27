import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { MutationCtx, mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { uniqueInvoiceNumber } from "./lib/feeQuote";
import { isIsoDate, requireRoles } from "./lib/auth";
import { studentName } from "./lib/studentName";
import {
  genderValidator,
  schoolAffiliationValidator,
  socialCategoryValidator,
  studentListItemValidator,
  studentStatusValidator,
  feeStatusValidator,
} from "./lib/validators";

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    classId: v.optional(v.id("classes")),
  },
  returns: v.object({
    page: v.array(studentListItemValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(
        v.null(),
        v.literal("SplitRecommended"),
        v.literal("SplitRequired"),
      ),
    ),
  }),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin"]);
    const result = args.classId
      ? await ctx.db
          .query("students")
          .withIndex("by_class", (q) => q.eq("classId", args.classId!))
          .paginate(args.paginationOpts)
      : await ctx.db.query("students").order("desc").paginate(args.paginationOpts);

    const page = [];
    for (const student of result.page) {
      const classroom = await ctx.db.get("classes", student.classId);
      const guardian = student.guardianUserId
        ? await ctx.db.get("users", student.guardianUserId)
        : null;
      page.push({
        ...student,
        classLabel: classroom
          ? `${classroom.name} ${classroom.section}`
          : "Unassigned",
        name: studentName(student),
        guardianName: student.guardianName ?? guardian?.name,
      });
    }
    return { ...result, page };
  },
});

export const listByClass = query({
  args: { classId: v.id("classes") },
  returns: v.array(studentListItemValidator),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin"]);
    const students = await ctx.db
      .query("students")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);
    const page = [];
    for (const student of students) {
      if (student.status !== "enrolled") {
        continue;
      }
      const classroom = await ctx.db.get("classes", student.classId);
      page.push({
        ...student,
        classLabel: classroom
          ? `${classroom.name} ${classroom.section}`
          : "Unassigned",
        name: studentName(student),
        guardianName: student.guardianName,
      });
    }
    return page;
  },
});

const genderValues = ["female", "male", "other"] as const;

function parseGender(value: string) {
  const gender = value.trim().toLowerCase();
  if (gender === "female" || gender === "male" || gender === "other") {
    return gender;
  }
  return null;
}

function parseSocialCategory(value: string) {
  const category = value.trim().toLowerCase();
  if (
    category === "general" ||
    category === "obc" ||
    category === "sc" ||
    category === "st"
  ) {
    return category;
  }
  return null;
}

function parseSchoolAffiliation(value: string) {
  const affiliation = value.trim().toLowerCase();
  if (
    affiliation === "state" ||
    affiliation === "cbse" ||
    affiliation === "icse" ||
    affiliation === "other"
  ) {
    return affiliation;
  }
  return null;
}

function parseTransportRequired(value: string) {
  const flag = value.trim().toLowerCase();
  if (flag === "yes" || flag === "y" || flag === "true") {
    return true;
  }
  if (flag === "no" || flag === "n" || flag === "false") {
    return false;
  }
  return null;
}

function parseDateOfBirth(value: string) {
  const trimmed = value.trim();
  if (isIsoDate(trimmed)) {
    return trimmed;
  }
  const match = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return isIsoDate(iso) ? iso : null;
}

function digitsFromCell(value: string) {
  const trimmed = value.trim();
  if (/e\+/i.test(trimmed)) {
    return trimmed;
  }
  const withoutDecimal = /^\d+\.0+$/.test(trimmed)
    ? trimmed.replace(/\.0+$/, "")
    : trimmed;
  return withoutDecimal.replace(/\D/g, "");
}

async function insertEnrolledStudent(
  ctx: MutationCtx,
  args: {
    admissionNumber: string;
    fullName: string;
    dateOfBirth: string;
    gender: (typeof genderValues)[number];
    classId: Id<"classes">;
    guardianName?: string;
    guardianPhone: string;
    aadhaarNumber: string;
    placeOfBirth?: string;
    religion?: string;
    caste?: string;
    motherTongue?: string;
    socialCategory?: "general" | "obc" | "sc" | "st";
    motherName?: string;
    fatherAadhaarNumber?: string;
    motherAadhaarNumber?: string;
    motherPhone?: string;
    email?: string;
    residentialAddress?: string;
    transportRequired?: boolean;
    previousSchoolAffiliation?: "state" | "cbse" | "icse" | "other";
    previousSchoolOther?: string;
    previousSchoolName?: string;
    guardianUserId?: Id<"users">;
    userId?: Id<"users">;
    discountType?: "percent" | "amount";
    discountValue?: number;
    discountReason?: string;
    admissionDate?: string;
  },
) {
  const admissionNumber = args.admissionNumber.trim();
  const fullName = args.fullName.trim();
  if (!admissionNumber || !fullName) {
    throw new Error("Admission number and student name are required");
  }
  const dateOfBirth = parseDateOfBirth(args.dateOfBirth);
  if (!dateOfBirth) {
    throw new Error("Date of birth must be YYYY-MM-DD");
  }
  const classroom = await ctx.db.get("classes", args.classId);
  if (!classroom) {
    throw new Error("Class not found");
  }
  const duplicate = await ctx.db
    .query("students")
    .withIndex("by_admission_number", (q) =>
      q.eq("admissionNumber", admissionNumber),
    )
    .unique();
  if (duplicate) {
    throw new Error("Admission number already exists");
  }
  const guardianPhone = digitsFromCell(args.guardianPhone);
  const aadhaarNumber = digitsFromCell(args.aadhaarNumber);
  if (/e\+/i.test(guardianPhone) || /e\+/i.test(aadhaarNumber)) {
    throw new Error(
      "Format parent number and Aadhaar as text in the spreadsheet",
    );
  }
  if (!/^[6-9]\d{9}$/.test(guardianPhone)) {
    throw new Error("Enter a 10-digit parent mobile number");
  }
  if (!/^\d{12}$/.test(aadhaarNumber)) {
    throw new Error("Aadhaar number must be 12 digits");
  }
  if (args.guardianUserId) {
    const guardian = await ctx.db.get("users", args.guardianUserId);
    if (!guardian || guardian.role !== "parent") {
      throw new Error("Guardian must be a parent user");
    }
  }
  if (args.userId) {
    const linked = await ctx.db.get("users", args.userId);
    if (!linked || linked.role !== "student") {
      throw new Error("Linked login must be a student user");
    }
  }
  const discountValue = args.discountValue ?? 0;
  if (discountValue < 0 || !Number.isFinite(discountValue)) {
    throw new Error("Discount must be zero or greater");
  }
  if (discountValue > 0) {
    if (args.discountType === "percent" && discountValue > 100) {
      throw new Error("Percent discount cannot exceed 100");
    }
    const reason = args.discountReason?.trim();
    if (!reason) {
      throw new Error("Describe why the discount is given");
    }
  }
  const guardianName = args.guardianName?.trim();
  const admissionDate = args.admissionDate
    ? parseDateOfBirth(args.admissionDate)
    : undefined;
  if (args.admissionDate && !admissionDate) {
    throw new Error("Admission date must be YYYY-MM-DD or DD-MM-YYYY");
  }
  return await ctx.db.insert("students", {
    admissionNumber,
    fullName,
    dateOfBirth,
    gender: args.gender,
    classId: args.classId,
    guardianUserId: args.guardianUserId,
    guardianName: guardianName || undefined,
    guardianPhone,
    aadhaarNumber,
    placeOfBirth: args.placeOfBirth,
    religion: args.religion,
    caste: args.caste,
    motherTongue: args.motherTongue,
    socialCategory: args.socialCategory,
    motherName: args.motherName,
    fatherAadhaarNumber: args.fatherAadhaarNumber,
    motherAadhaarNumber: args.motherAadhaarNumber,
    motherPhone: args.motherPhone,
    email: args.email,
    residentialAddress: args.residentialAddress,
    transportRequired: args.transportRequired,
    previousSchoolAffiliation: args.previousSchoolAffiliation,
    previousSchoolOther: args.previousSchoolOther,
    previousSchoolName: args.previousSchoolName,
    userId: args.userId,
    status: "enrolled",
    discountType: discountValue > 0 ? args.discountType : undefined,
    discountValue: discountValue > 0 ? discountValue : undefined,
    discountReason:
      discountValue > 0 ? args.discountReason?.trim() : undefined,
    admissionDate: admissionDate ?? undefined,
  });
}

function requireText(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function requireMobile(value: string, label: string) {
  const digits = digitsFromCell(value);
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new Error(`${label} must be a 10-digit mobile number`);
  }
  return digits;
}

function requireAadhaar(value: string, label: string) {
  const digits = digitsFromCell(value);
  if (!/^\d{12}$/.test(digits)) {
    throw new Error(`${label} must be 12 digits`);
  }
  return digits;
}

export const enroll = mutation({
  args: {
    admissionNumber: v.string(),
    fullName: v.string(),
    dateOfBirth: v.string(),
    gender: genderValidator,
    classId: v.id("classes"),
    guardianUserId: v.optional(v.id("users")),
    guardianName: v.string(),
    guardianPhone: v.string(),
    aadhaarNumber: v.string(),
    placeOfBirth: v.string(),
    religion: v.string(),
    caste: v.string(),
    motherTongue: v.string(),
    socialCategory: socialCategoryValidator,
    motherName: v.string(),
    fatherAadhaarNumber: v.string(),
    motherAadhaarNumber: v.string(),
    motherPhone: v.string(),
    email: v.string(),
    residentialAddress: v.string(),
    transportRequired: v.boolean(),
    previousSchoolAffiliation: schoolAffiliationValidator,
    previousSchoolOther: v.optional(v.string()),
    previousSchoolName: v.string(),
    userId: v.optional(v.id("users")),
    discountType: v.optional(v.union(v.literal("percent"), v.literal("amount"))),
    discountValue: v.optional(v.number()),
    discountReason: v.optional(v.string()),
  },
  returns: v.id("students"),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin"]);
    const email = requireText(args.email, "Email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email");
    }
    const previousSchoolOther = args.previousSchoolOther?.trim() ?? "";
    if (args.previousSchoolAffiliation === "other" && !previousSchoolOther) {
      throw new Error("Enter the previous school affiliation");
    }
    return await insertEnrolledStudent(ctx, {
      ...args,
      guardianName: requireText(args.guardianName, "Father name"),
      placeOfBirth: requireText(args.placeOfBirth, "Place of birth"),
      religion: requireText(args.religion, "Religion"),
      caste: requireText(args.caste, "Caste"),
      motherTongue: requireText(args.motherTongue, "Mother tongue"),
      motherName: requireText(args.motherName, "Mother name"),
      fatherAadhaarNumber: requireAadhaar(
        args.fatherAadhaarNumber,
        "Father's Aadhaar number",
      ),
      motherAadhaarNumber: requireAadhaar(
        args.motherAadhaarNumber,
        "Mother's Aadhaar number",
      ),
      motherPhone: requireMobile(args.motherPhone, "Mother mobile"),
      email,
      residentialAddress: requireText(
        args.residentialAddress,
        "Residential address",
      ),
      previousSchoolName: requireText(
        args.previousSchoolName,
        "Previous school name",
      ),
      previousSchoolOther:
        args.previousSchoolAffiliation === "other"
          ? previousSchoolOther
          : undefined,
    });
  },
});

function readDiscount(student: {
  discountAmount?: string;
  discountPercent?: string;
  description?: string;
}) {
  const amount = parseDiscountCell(student.discountAmount, "Discount amount");
  const percent = parseDiscountCell(student.discountPercent, "Discount percent");
  if (amount > 0 && percent > 0) {
    throw new Error("Enter either a discount amount or a discount percent");
  }
  if (percent > 100) {
    throw new Error("Discount percent cannot exceed 100");
  }
  if (amount > 0) {
    return {
      discountType: "amount" as const,
      discountValue: amount,
      discountReason: student.description,
    };
  }
  if (percent > 0) {
    return {
      discountType: "percent" as const,
      discountValue: percent,
      discountReason: student.description,
    };
  }
  return {
    discountType: undefined,
    discountValue: undefined,
    discountReason: undefined,
  };
}

function parseDiscountCell(value: string | undefined, label: string) {
  const trimmed = (value ?? "").trim().replace(/%$/, "").replace(/,/g, "");
  if (!trimmed) {
    return 0;
  }
  const number = Number(trimmed);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be zero or greater`);
  }
  return number;
}

const bulkStudentValidator = v.object({
  row: v.number(),
  admissionNumber: v.string(),
  fullName: v.string(),
  dateOfBirth: v.string(),
  gender: v.string(),
  className: v.string(),
  section: v.string(),
  placeOfBirth: v.string(),
  religion: v.string(),
  caste: v.string(),
  motherTongue: v.string(),
  socialCategory: v.string(),
  fatherName: v.string(),
  motherName: v.string(),
  fatherAadhaarNumber: v.string(),
  motherAadhaarNumber: v.string(),
  fatherMobile: v.string(),
  motherMobile: v.string(),
  aadhaarNumber: v.string(),
  email: v.string(),
  residentialAddress: v.string(),
  transportRequired: v.string(),
  previousSchoolAffiliation: v.string(),
  previousSchoolOther: v.optional(v.string()),
  previousSchoolName: v.string(),
  discountAmount: v.optional(v.string()),
  discountPercent: v.optional(v.string()),
  description: v.optional(v.string()),
  admissionDate: v.optional(v.string()),
  amountPaid: v.optional(v.string()),
});

const bulkFailureValidator = v.object({
  row: v.number(),
  admissionNumber: v.string(),
  message: v.string(),
});

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function monthlyClassCharge(
  classroom: Doc<"classes">,
  discountType: "percent" | "amount" | undefined,
  discountValue: number | undefined,
) {
  const tuition = classroom.baseTuitionFee ?? 0;
  const extras = (classroom.extraFees ?? []).reduce(
    (sum, fee) => sum + (fee.amount > 0 ? fee.amount : 0),
    0,
  );
  const cycleTotal = tuition + extras;
  const monthly =
    classroom.tuitionCycle === "annual" ? cycleTotal / 12 : cycleTotal;
  const value = discountValue ?? 0;
  if (value <= 0 || monthly <= 0) {
    return Math.max(0, monthly);
  }
  const discount =
    discountType === "percent" ? (monthly * value) / 100 : value;
  return Math.max(0, monthly - Math.min(monthly, discount));
}

function billedMonths(admissionDate: string, asOf: string) {
  if (admissionDate > asOf) {
    throw new Error("Admission date cannot be in the future");
  }
  const [startYear, startMonth, startDay] = admissionDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = asOf.split("-").map(Number);
  if (
    !startYear ||
    !startMonth ||
    !startDay ||
    !endYear ||
    !endMonth ||
    !endDay
  ) {
    throw new Error("Admission date must be YYYY-MM-DD or DD-MM-YYYY");
  }
  let months = (endYear - startYear) * 12 + (endMonth - startMonth);
  if (endDay < startDay) {
    months -= 1;
  }
  return Math.max(1, months);
}

async function recordOpeningFees(
  ctx: MutationCtx,
  studentId: Id<"students">,
  classroom: Doc<"classes">,
  discountType: "percent" | "amount" | undefined,
  discountValue: number | undefined,
  admissionDate: string,
  amountPaid: number,
  asOf: string,
) {
  const monthly = monthlyClassCharge(classroom, discountType, discountValue);
  const months = billedMonths(admissionDate, asOf);
  const total = roundMoney(monthly * months);
  const paid = roundMoney(amountPaid);
  if (total <= 0 && paid > 0) {
    throw new Error(
      "This class has no monthly fee, so the paid amount cannot be applied",
    );
  }
  if (total <= 0) {
    return;
  }
  const student = await ctx.db.get("students", studentId);
  if (!student) {
    throw new Error("Student not found");
  }
  const invoiceNumber = await uniqueInvoiceNumber(ctx, student, asOf);
  const status =
    paid >= total ? "paid" : paid > 0 ? "partial" : "pending";
  const classLabel = `${classroom.name} ${classroom.section}`.trim();
  await ctx.db.insert("fees", {
    studentId,
    amount: total,
    dueDate: asOf,
    status,
    invoiceNumber,
    paidAmount: paid,
    notes: `${months} month${months === 1 ? "" : "s"} from ${admissionDate} at ${monthly.toFixed(2)} per month for ${classLabel}. Amount paid ${paid.toFixed(2)}.`,
    lastPaymentAt: paid > 0 ? Date.now() : undefined,
  });
}

export const enrollMany = mutation({
  args: {
    asOf: v.string(),
    students: v.array(bulkStudentValidator),
  },
  returns: v.object({
    created: v.number(),
    failed: v.array(bulkFailureValidator),
  }),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin"]);
    if (!isIsoDate(args.asOf)) {
      throw new Error("Upload date must be YYYY-MM-DD");
    }
    if (args.students.length === 0) {
      throw new Error("The CSV file has no student rows");
    }
    if (args.students.length > 100) {
      throw new Error("Upload at most 100 students at a time");
    }

    const classes = await ctx.db.query("classes").take(100);
    const seenAdmissionNumbers = new Set<string>();
    const failed: Array<{
      row: number;
      admissionNumber: string;
      message: string;
    }> = [];
    let created = 0;

    for (const student of args.students) {
      const admissionNumber = student.admissionNumber.trim();
      try {
        const gender = parseGender(student.gender);
        if (!gender) {
          throw new Error("Gender must be female, male, or other");
        }
        const className = student.className.trim().toLowerCase();
        const section = student.section.trim().toLowerCase();
        const classroom = classes.find(
          (item) =>
            item.name.trim().toLowerCase() === className &&
            item.section.trim().toLowerCase() === section,
        );
        if (!classroom) {
          throw new Error(
            `Class not found: ${student.className.trim()} ${student.section.trim()}`.trim(),
          );
        }
        if (admissionNumber && seenAdmissionNumbers.has(admissionNumber)) {
          throw new Error("Admission number is repeated in this file");
        }
        const discount = readDiscount(student);
        const amountPaid = parseDiscountCell(student.amountPaid, "Amount paid");
        const admissionDate = student.admissionDate?.trim()
          ? parseDateOfBirth(student.admissionDate)
          : undefined;
        if (student.admissionDate?.trim() && !admissionDate) {
          throw new Error("Admission date must be YYYY-MM-DD or DD-MM-YYYY");
        }
        if (amountPaid > 0 && !admissionDate) {
          throw new Error(
            "Admission date is required when an amount paid is entered",
          );
        }
        const socialCategory = parseSocialCategory(student.socialCategory);
        if (!socialCategory) {
          throw new Error("Social category must be general, obc, sc, or st");
        }
        const previousSchoolAffiliation = parseSchoolAffiliation(
          student.previousSchoolAffiliation,
        );
        if (!previousSchoolAffiliation) {
          throw new Error(
            "Previous school affiliation must be state, cbse, icse, or other",
          );
        }
        const transportRequired = parseTransportRequired(student.transportRequired);
        if (transportRequired === null) {
          throw new Error("Transport required must be yes or no");
        }
        const email = requireText(student.email, "Email");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error("Enter a valid email");
        }
        const previousSchoolOther = student.previousSchoolOther?.trim() ?? "";
        if (previousSchoolAffiliation === "other" && !previousSchoolOther) {
          throw new Error("Enter the previous school affiliation");
        }
        const studentId = await insertEnrolledStudent(ctx, {
          admissionNumber,
          fullName: student.fullName,
          dateOfBirth: student.dateOfBirth,
          gender,
          classId: classroom._id,
          guardianName: requireText(student.fatherName, "Father name"),
          guardianPhone: student.fatherMobile,
          aadhaarNumber: student.aadhaarNumber,
          placeOfBirth: requireText(student.placeOfBirth, "Place of birth"),
          religion: requireText(student.religion, "Religion"),
          caste: requireText(student.caste, "Caste"),
          motherTongue: requireText(student.motherTongue, "Mother tongue"),
          socialCategory,
          motherName: requireText(student.motherName, "Mother name"),
          fatherAadhaarNumber: requireAadhaar(
            student.fatherAadhaarNumber,
            "Father's Aadhaar number",
          ),
          motherAadhaarNumber: requireAadhaar(
            student.motherAadhaarNumber,
            "Mother's Aadhaar number",
          ),
          motherPhone: requireMobile(student.motherMobile, "Mother mobile"),
          email,
          residentialAddress: requireText(
            student.residentialAddress,
            "Residential address",
          ),
          transportRequired,
          previousSchoolAffiliation,
          previousSchoolOther:
            previousSchoolAffiliation === "other"
              ? previousSchoolOther
              : undefined,
          previousSchoolName: requireText(
            student.previousSchoolName,
            "Previous school name",
          ),
          discountType: discount.discountType,
          discountValue: discount.discountValue,
          discountReason: discount.discountReason,
          admissionDate: admissionDate ?? undefined,
        });
        if (admissionDate) {
          try {
            await recordOpeningFees(
              ctx,
              studentId,
              classroom,
              discount.discountType,
              discount.discountValue,
              admissionDate,
              amountPaid,
              args.asOf,
            );
          } catch (error) {
            await ctx.db.delete("students", studentId);
            throw error;
          }
        }
        if (admissionNumber) {
          seenAdmissionNumbers.add(admissionNumber);
        }
        created += 1;
      } catch (error) {
        failed.push({
          row: student.row,
          admissionNumber,
          message: error instanceof Error ? error.message : "Could not enroll",
        });
      }
    }

    return { created, failed };
  },
});

export const setStatus = mutation({
  args: {
    studentId: v.id("students"),
    status: studentStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin"]);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) {
      throw new Error("Student not found");
    }
    await ctx.db.patch("students", args.studentId, { status: args.status });
    return null;
  },
});

const directoryFeeFilter = v.union(
  v.literal("all"),
  v.literal("due"),
  v.literal("paid"),
  v.literal("none"),
);

const directoryInvoiceValidator = v.object({
  _id: v.id("fees"),
  invoiceNumber: v.string(),
  amount: v.number(),
  paidAmount: v.number(),
  dueDate: v.string(),
  status: feeStatusValidator,
});

const directoryRowValidator = v.object({
  studentId: v.id("students"),
  admissionNumber: v.string(),
  studentName: v.string(),
  classId: v.id("classes"),
  classLabel: v.string(),
  status: studentStatusValidator,
  billed: v.number(),
  paid: v.number(),
  due: v.number(),
  feeStatus: v.union(v.literal("paid"), v.literal("due"), v.literal("none")),
  attendanceMarked: v.number(),
  attendancePresent: v.number(),
  attendancePercent: v.union(v.number(), v.null()),
  invoices: v.array(directoryInvoiceValidator),
});

export const directory = query({
  args: {
    classId: v.optional(v.id("classes")),
    feeFilter: v.optional(directoryFeeFilter),
  },
  returns: v.array(directoryRowValidator),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin"]);
    const students = args.classId
      ? await ctx.db
          .query("students")
          .withIndex("by_class", (q) => q.eq("classId", args.classId!))
          .take(80)
      : await ctx.db.query("students").take(80);

    const rows = [];
    for (const student of students) {
      if (student.status !== "enrolled") {
        continue;
      }
      const classroom = await ctx.db.get("classes", student.classId);
      const invoices = await ctx.db
        .query("fees")
        .withIndex("by_student", (q) => q.eq("studentId", student._id))
        .take(20);
      const billed = invoices.reduce((sum, fee) => sum + fee.amount, 0);
      const paid = invoices.reduce(
        (sum, fee) => sum + (fee.paidAmount ?? 0),
        0,
      );
      const due = Math.max(0, billed - paid);
      const feeStatus: "paid" | "due" | "none" =
        invoices.length === 0 ? "none" : due > 0 ? "due" : "paid";
      const filter = args.feeFilter ?? "all";
      if (filter !== "all" && feeStatus !== filter) {
        continue;
      }

      const marks = await ctx.db
        .query("attendance")
        .withIndex("by_student", (q) => q.eq("studentId", student._id))
        .take(120);
      const attendancePresent = marks.filter(
        (row) => row.status === "present" || row.status === "late",
      ).length;
      const attendanceMarked = marks.length;

      rows.push({
        studentId: student._id,
        admissionNumber: student.admissionNumber,
        studentName: studentName(student),
        classId: student.classId,
        classLabel: classroom
          ? `${classroom.name} ${classroom.section}`.trim()
          : "Unassigned",
        status: student.status,
        billed,
        paid,
        due,
        feeStatus,
        attendanceMarked,
        attendancePresent,
        attendancePercent:
          attendanceMarked === 0
            ? null
            : Math.round((attendancePresent / attendanceMarked) * 100),
        invoices: invoices.map((fee) => ({
          _id: fee._id,
          invoiceNumber: fee.invoiceNumber,
          amount: fee.amount,
          paidAmount: fee.paidAmount ?? 0,
          dueDate: fee.dueDate,
          status: fee.status,
        })),
      });
    }

    rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
    return rows;
  },
});

const teacherDirectoryRowValidator = v.object({
  studentId: v.id("students"),
  studentName: v.string(),
  guardianName: v.optional(v.string()),
  guardianPhone: v.optional(v.string()),
  attendanceMarked: v.number(),
  attendancePresent: v.number(),
  attendancePercent: v.union(v.number(), v.null()),
});

export const teacherDirectory = query({
  args: {
    classId: v.optional(v.id("classes")),
  },
  returns: v.array(teacherDirectoryRowValidator),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["teacher"]);
    const students = args.classId
      ? await ctx.db
          .query("students")
          .withIndex("by_class", (q) => q.eq("classId", args.classId!))
          .take(80)
      : await ctx.db.query("students").take(80);

    const rows = [];
    for (const student of students) {
      if (student.status !== "enrolled") {
        continue;
      }
      const marks = await ctx.db
        .query("attendance")
        .withIndex("by_student", (q) => q.eq("studentId", student._id))
        .take(120);
      const attendancePresent = marks.filter(
        (row) => row.status === "present" || row.status === "late",
      ).length;
      const attendanceMarked = marks.length;
      rows.push({
        studentId: student._id,
        studentName: studentName(student),
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        attendanceMarked,
        attendancePresent,
        attendancePercent:
          attendanceMarked === 0
            ? null
            : Math.round((attendancePresent / attendanceMarked) * 100),
      });
    }
    rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
    return rows;
  },
});

const profileValidator = v.object({
  studentId: v.id("students"),
  admissionNumber: v.string(),
  fullName: v.string(),
  dateOfBirth: v.string(),
  gender: genderValidator,
  placeOfBirth: v.optional(v.string()),
  religion: v.optional(v.string()),
  caste: v.optional(v.string()),
  motherTongue: v.optional(v.string()),
  socialCategory: v.optional(socialCategoryValidator),
  aadhaarNumber: v.optional(v.string()),
  classLabel: v.string(),
  guardianName: v.optional(v.string()),
  motherName: v.optional(v.string()),
  guardianPhone: v.optional(v.string()),
  motherPhone: v.optional(v.string()),
  fatherAadhaarNumber: v.optional(v.string()),
  motherAadhaarNumber: v.optional(v.string()),
  email: v.optional(v.string()),
  residentialAddress: v.optional(v.string()),
  transportRequired: v.optional(v.boolean()),
  previousSchoolAffiliation: v.optional(schoolAffiliationValidator),
  previousSchoolOther: v.optional(v.string()),
  previousSchoolName: v.optional(v.string()),
  admissionDate: v.optional(v.string()),
  discountType: v.optional(v.union(v.literal("percent"), v.literal("amount"))),
  discountValue: v.optional(v.number()),
  discountReason: v.optional(v.string()),
  billed: v.number(),
  paid: v.number(),
  due: v.number(),
  feeStatus: v.union(v.literal("paid"), v.literal("due"), v.literal("none")),
  attendanceMarked: v.number(),
  attendancePresent: v.number(),
  attendancePercent: v.union(v.number(), v.null()),
});

export const profile = query({
  args: { studentId: v.id("students") },
  returns: v.union(profileValidator, v.null()),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin"]);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) {
      return null;
    }
    const classroom = await ctx.db.get("classes", student.classId);
    const invoices = await ctx.db
      .query("fees")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .take(20);
    const billed = invoices.reduce((sum, fee) => sum + fee.amount, 0);
    const paid = invoices.reduce((sum, fee) => sum + (fee.paidAmount ?? 0), 0);
    const due = Math.max(0, billed - paid);
    const feeStatus = (
      invoices.length === 0 ? "none" : due > 0 ? "due" : "paid"
    ) as "paid" | "due" | "none";
    const marks = await ctx.db
      .query("attendance")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .take(120);
    const attendancePresent = marks.filter(
      (row) => row.status === "present" || row.status === "late",
    ).length;
    return {
      studentId: student._id,
      admissionNumber: student.admissionNumber,
      fullName: studentName(student),
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      placeOfBirth: student.placeOfBirth,
      religion: student.religion,
      caste: student.caste,
      motherTongue: student.motherTongue,
      socialCategory: student.socialCategory,
      aadhaarNumber: student.aadhaarNumber,
      classLabel: classroom
        ? `${classroom.name} ${classroom.section}`.trim()
        : "Unassigned",
      guardianName: student.guardianName,
      motherName: student.motherName,
      guardianPhone: student.guardianPhone,
      motherPhone: student.motherPhone,
      fatherAadhaarNumber: student.fatherAadhaarNumber,
      motherAadhaarNumber: student.motherAadhaarNumber,
      email: student.email,
      residentialAddress: student.residentialAddress,
      transportRequired: student.transportRequired,
      previousSchoolAffiliation: student.previousSchoolAffiliation,
      previousSchoolOther: student.previousSchoolOther,
      previousSchoolName: student.previousSchoolName,
      admissionDate: student.admissionDate,
      discountType: student.discountType,
      discountValue: student.discountValue,
      discountReason: student.discountReason,
      billed,
      paid,
      due,
      feeStatus,
      attendanceMarked: marks.length,
      attendancePresent,
      attendancePercent:
        marks.length === 0
          ? null
          : Math.round((attendancePresent / marks.length) * 100),
    };
  },
});

export const updateProfile = mutation({
  args: {
    studentId: v.id("students"),
    admissionNumber: v.string(),
    fullName: v.string(),
    dateOfBirth: v.string(),
    gender: genderValidator,
    placeOfBirth: v.string(),
    religion: v.string(),
    caste: v.string(),
    motherTongue: v.string(),
    socialCategory: socialCategoryValidator,
    guardianName: v.string(),
    motherName: v.string(),
    guardianPhone: v.string(),
    motherPhone: v.string(),
    aadhaarNumber: v.string(),
    fatherAadhaarNumber: v.string(),
    motherAadhaarNumber: v.string(),
    email: v.string(),
    residentialAddress: v.string(),
    transportRequired: v.boolean(),
    previousSchoolAffiliation: schoolAffiliationValidator,
    previousSchoolOther: v.optional(v.string()),
    previousSchoolName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin"]);
    const student = await ctx.db.get("students", args.studentId);
    if (!student) {
      throw new Error("Student not found");
    }
    const admissionNumber = requireText(args.admissionNumber, "Admission number");
    const existing = await ctx.db
      .query("students")
      .withIndex("by_admission_number", (q) =>
        q.eq("admissionNumber", admissionNumber),
      )
      .unique();
    if (existing && existing._id !== student._id) {
      throw new Error("Admission number already exists");
    }
    const dateOfBirth = parseDateOfBirth(args.dateOfBirth);
    if (!dateOfBirth) {
      throw new Error("Date of birth must be YYYY-MM-DD or DD-MM-YYYY");
    }
    const email = requireText(args.email, "Email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email");
    }
    const previousSchoolOther = args.previousSchoolOther?.trim() ?? "";
    if (args.previousSchoolAffiliation === "other" && !previousSchoolOther) {
      throw new Error("Enter the previous school affiliation");
    }
    await ctx.db.patch("students", args.studentId, {
      admissionNumber,
      fullName: requireText(args.fullName, "Student name"),
      dateOfBirth,
      gender: args.gender,
      placeOfBirth: requireText(args.placeOfBirth, "Place of birth"),
      religion: requireText(args.religion, "Religion"),
      caste: requireText(args.caste, "Caste"),
      motherTongue: requireText(args.motherTongue, "Mother tongue"),
      socialCategory: args.socialCategory,
      guardianName: requireText(args.guardianName, "Father name"),
      motherName: requireText(args.motherName, "Mother name"),
      guardianPhone: requireMobile(args.guardianPhone, "Father mobile"),
      motherPhone: requireMobile(args.motherPhone, "Mother mobile"),
      aadhaarNumber: requireAadhaar(args.aadhaarNumber, "Student Aadhaar number"),
      fatherAadhaarNumber: requireAadhaar(
        args.fatherAadhaarNumber,
        "Father's Aadhaar number",
      ),
      motherAadhaarNumber: requireAadhaar(
        args.motherAadhaarNumber,
        "Mother's Aadhaar number",
      ),
      email,
      residentialAddress: requireText(
        args.residentialAddress,
        "Residential address",
      ),
      transportRequired: args.transportRequired,
      previousSchoolAffiliation: args.previousSchoolAffiliation,
      previousSchoolOther:
        args.previousSchoolAffiliation === "other"
          ? previousSchoolOther
          : undefined,
      previousSchoolName: requireText(
        args.previousSchoolName,
        "Previous school name",
      ),
    });
    return null;
  },
});
