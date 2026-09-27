import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { studentName } from "./studentName";

export const feeLineValidator = v.object({
  label: v.string(),
  amount: v.number(),
});

export const feeQuoteValidator = v.object({
  studentId: v.id("students"),
  studentName: v.string(),
  admissionNumber: v.string(),
  classLabel: v.string(),
  tuitionCycle: v.union(v.literal("monthly"), v.literal("annual")),
  lines: v.array(feeLineValidator),
  total: v.number(),
});

export type FeeQuote = {
  studentId: Id<"students">;
  studentName: string;
  admissionNumber: string;
  classLabel: string;
  tuitionCycle: "monthly" | "annual";
  lines: Array<{ label: string; amount: number }>;
  total: number;
};

export async function quoteStudentFee(
  ctx: QueryCtx | MutationCtx,
  studentId: Id<"students">,
): Promise<FeeQuote> {
  const student = await ctx.db.get("students", studentId);
  if (!student || student.status !== "enrolled") {
    throw new Error("Student not found");
  }

  const classroom = await ctx.db.get("classes", student.classId);
  if (!classroom) {
    throw new Error("Class not found for this student");
  }

  const tuitionCycle = classroom.tuitionCycle ?? "monthly";
  const extraFees = classroom.extraFees ?? [];
  const lines: Array<{ label: string; amount: number }> = [];

  const tuition = classroom.baseTuitionFee ?? 0;
  const extraTotal = extraFees.reduce(
    (sum, fee) => sum + (fee.amount > 0 ? fee.amount : 0),
    0,
  );
  const classSubtotal = tuition + extraTotal;

  if (tuition > 0) {
    lines.push({
      label: `Tuition (${tuitionCycle})`,
      amount: tuition,
    });
  }

  for (const fee of extraFees) {
    if (fee.amount > 0) {
      lines.push({ label: fee.label, amount: fee.amount });
    }
  }

  const discountValue = student.discountValue ?? 0;
  if (discountValue > 0 && classSubtotal > 0) {
    const raw =
      student.discountType === "percent"
        ? (classSubtotal * discountValue) / 100
        : discountValue;
    const discountAmount = Math.min(classSubtotal, raw);
    const reason = student.discountReason?.trim();
    lines.push({
      label: reason
        ? `Discount (${reason})`
        : student.discountType === "percent"
          ? `Discount (${discountValue}%)`
          : "Discount",
      amount: -discountAmount,
    });
  }

  const assignment = await ctx.db
    .query("studentTransport")
    .withIndex("by_student", (q) => q.eq("studentId", student._id))
    .unique();
  if (assignment) {
    const route = await ctx.db.get("transportRoutes", assignment.routeId);
    const transportFee = assignment.customFee ?? route?.defaultFee ?? 0;
    if (transportFee > 0) {
      const stop = assignment.stopName ? ` · ${assignment.stopName}` : "";
      lines.push({
        label: `Transport${route ? ` (${route.name}${stop})` : stop}`,
        amount: transportFee,
      });
    }
  }

  const total = lines.reduce((sum, line) => sum + line.amount, 0);

  return {
    studentId: student._id,
    studentName: studentName(student),
    admissionNumber: student.admissionNumber,
    classLabel: `${classroom.name} ${classroom.section}`.trim(),
    tuitionCycle,
    lines,
    total,
  };
}

export function quoteNotes(quote: FeeQuote, extraNotes?: string) {
  const breakdown = quote.lines
    .map((line) => `${line.label}: ${line.amount.toFixed(2)}`)
    .join(" · ");
  const trimmed = extraNotes?.trim();
  return trimmed ? `${trimmed}\n${breakdown}` : breakdown;
}

export async function uniqueInvoiceNumber(
  ctx: MutationCtx,
  student: Doc<"students">,
  dueDate: string,
) {
  const base = `INV-${student.admissionNumber.trim()}-${dueDate}`;
  const existing = await ctx.db
    .query("fees")
    .withIndex("by_invoice_number", (q) => q.eq("invoiceNumber", base))
    .unique();
  if (!existing) {
    return base;
  }
  return `${base}-${Date.now()}`;
}
