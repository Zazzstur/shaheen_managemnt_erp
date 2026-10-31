import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx } from "../_generated/server";
import {
  academicFeeBreakdown,
  eachMonth,
  feeScheduleWindow,
} from "./feeLedger";

export type ClassChangePoint = {
  fromClassId: Id<"classes">;
  toClassId: Id<"classes">;
  effectiveMonth: string;
};

/** Class that applies in `month`. Months before the first change stay on the original class. */
export function classIdForMonth(
  currentClassId: Id<"classes">,
  changes: ClassChangePoint[],
  month: string,
) {
  const sorted = [...changes].sort((left, right) =>
    left.effectiveMonth.localeCompare(right.effectiveMonth),
  );
  if (sorted.length === 0) {
    return currentClassId;
  }
  let classId = sorted[0].fromClassId;
  for (const change of sorted) {
    if (month < change.effectiveMonth) {
      return classId;
    }
    classId = change.toClassId;
  }
  return classId;
}

function monthlyFee(classroom: Doc<"classes">, student: Doc<"students">) {
  return academicFeeBreakdown({
    baseTuitionFee: classroom.baseTuitionFee,
    extraFees: classroom.extraFees,
    tuitionCycle: classroom.tuitionCycle,
    discountType: student.discountType,
    discountValue: student.discountValue,
  }).monthlyFee;
}

export async function academicSchedule(
  ctx: QueryCtx,
  student: Doc<"students">,
  asOf: string,
) {
  const classroom = await ctx.db.get("classes", student.classId);
  if (!classroom) {
    throw new Error("Class not found for this student");
  }
  const window = feeScheduleWindow(classroom.academicYear, asOf);
  const changes = await ctx.db
    .query("classChanges")
    .withIndex("by_student", (q) => q.eq("studentId", student._id))
    .collect();
  const points = changes.map((change) => ({
    fromClassId: change.fromClassId,
    toClassId: change.toClassId,
    effectiveMonth: change.effectiveMonth,
  }));
  const currentRate = monthlyFee(classroom, student);
  if (points.length === 0) {
    return {
      classroom,
      monthlyRate: currentRate,
      monthCharges: undefined as Record<string, number> | undefined,
      ...window,
    };
  }

  const rates = new Map<Id<"classes">, number>();
  rates.set(classroom._id, currentRate);
  async function rateFor(classId: Id<"classes">) {
    const cached = rates.get(classId);
    if (cached !== undefined) {
      return cached;
    }
    const row = await ctx.db.get("classes", classId);
    const rate = row ? monthlyFee(row, student) : 0;
    rates.set(classId, rate);
    return rate;
  }

  const monthCharges: Record<string, number> = {};
  for (const month of eachMonth(window.fromMonth, window.throughMonth)) {
    const classId = classIdForMonth(student.classId, points, month);
    monthCharges[month] = await rateFor(classId);
  }
  return {
    classroom,
    monthlyRate: monthCharges[window.asOfMonth] ?? currentRate,
    monthCharges,
    ...window,
  };
}
