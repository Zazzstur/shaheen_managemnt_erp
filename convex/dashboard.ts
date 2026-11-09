import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { canViewSchoolAdmin, getCurrentUser, isIsoDate } from "./lib/auth";
import { studentName } from "./lib/studentName";

const MAX_DAYS = 190;

const countFields = {
  present: v.number(),
  absent: v.number(),
  late: v.number(),
  marked: v.number(),
  rate: v.union(v.number(), v.null()),
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function rate(present: number, marked: number) {
  if (marked === 0) {
    return null;
  }
  return Math.round((present / marked) * 100);
}

function eachDate(from: string, to: string) {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new Error("Dates must be YYYY-MM-DD");
  }
  if (from > to) {
    throw new Error("Start date must be on or before the end date");
  }
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (dates.length > MAX_DAYS) {
      throw new Error("Date range is too long");
    }
  }
  return dates;
}

function shortLabel(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

type Counts = {
  present: number;
  absent: number;
  late: number;
};

function emptyCounts(): Counts {
  return { present: 0, absent: 0, late: 0 };
}

function addStatus(counts: Counts, status: string) {
  if (status === "present") {
    counts.present += 1;
  } else if (status === "absent") {
    counts.absent += 1;
  } else if (status === "late") {
    counts.late += 1;
  }
}

function withRate(counts: Counts) {
  const marked = counts.present + counts.absent + counts.late;
  return {
    ...counts,
    marked,
    rate: rate(counts.present, marked),
  };
}

async function teacherClassIds(ctx: QueryCtx, user: Doc<"users">) {
  const ids = new Set<Id<"classes">>();
  if (user.classId) {
    ids.add(user.classId);
  }
  for (const classId of user.classIds ?? []) {
    ids.add(classId);
  }
  const slots = await ctx.db
    .query("timetables")
    .withIndex("by_teacher", (q) => q.eq("teacherId", user._id))
    .take(300);
  for (const slot of slots) {
    ids.add(slot.classId);
  }
  return [...ids];
}

async function studentsInScope(ctx: QueryCtx, user: Doc<"users">) {
  if (canViewSchoolAdmin(user)) {
    const students = await ctx.db.query("students").take(500);
    return {
      scope: "school" as const,
      showFees: true,
      students: students.filter((student) => student.status === "enrolled"),
    };
  }

  if (user.role === "teacher") {
    const classIds = await teacherClassIds(ctx, user);
    const students = [];
    for (const classId of classIds) {
      const rows = await ctx.db
        .query("students")
        .withIndex("by_class", (q) => q.eq("classId", classId))
        .take(200);
      for (const student of rows) {
        if (student.status === "enrolled") {
          students.push(student);
        }
      }
    }
    return { scope: "classes" as const, showFees: false, students };
  }

  if (user.role === "student") {
    const rows = await ctx.db
      .query("students")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(5);
    return {
      scope: "family" as const,
      showFees: true,
      students: rows.filter((student) => student.status === "enrolled"),
    };
  }

  const rows = await ctx.db
    .query("students")
    .withIndex("by_guardian", (q) => q.eq("guardianUserId", user._id))
    .take(20);
  return {
    scope: "family" as const,
    showFees: true,
    students: rows.filter((student) => student.status === "enrolled"),
  };
}

export const overview = query({
  args: {
    from: v.string(),
    to: v.string(),
  },
  returns: v.object({
    scope: v.union(
      v.literal("school"),
      v.literal("classes"),
      v.literal("family"),
    ),
    showFees: v.boolean(),
    showExpenses: v.boolean(),
    from: v.string(),
    to: v.string(),
    attendance: v.object(countFields),
    groups: v.array(
      v.object({
        label: v.string(),
        ...countFields,
      }),
    ),
    points: v.array(
      v.object({
        label: v.string(),
        present: v.number(),
        absent: v.number(),
        late: v.number(),
        collected: v.number(),
        academic: v.number(),
        transport: v.number(),
        academicDiscount: v.number(),
        fuel: v.number(),
        staff: v.number(),
        stock: v.number(),
        other: v.number(),
      }),
    ),
    expenses: v.object({
      total: v.number(),
      fuel: v.number(),
      staff: v.number(),
      stock: v.number(),
      other: v.number(),
    }),
    fees: v.object({
      collected: v.number(),
      academic: v.number(),
      transport: v.number(),
      academicDiscount: v.number(),
      cash: v.number(),
      online: v.number(),
      paymentCount: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const dates = eachDate(args.from, args.to);
    const { scope, showFees, students } = await studentsInScope(ctx, user);
    const showExpenses = canViewSchoolAdmin(user);

    const totals = emptyCounts();
    const byGroup = new Map<string, { label: string; counts: Counts }>();
    const byDate = new Map<string, Counts>();
    for (const date of dates) {
      byDate.set(date, emptyCounts());
    }

    for (const student of students) {
      const classroom = await ctx.db.get("classes", student.classId);
      const classLabel = classroom
        ? `${classroom.name} ${classroom.section}`.trim()
        : "Class";
      const groupKey = scope === "family" ? student._id : String(student.classId);
      const groupLabel = scope === "family" ? studentName(student) : classLabel;
      const group = byGroup.get(groupKey) ?? {
        label: groupLabel || "Student",
        counts: emptyCounts(),
      };
      byGroup.set(groupKey, group);

      const marks = await ctx.db
        .query("attendance")
        .withIndex("by_student_and_date", (q) =>
          q.eq("studentId", student._id).gte("date", args.from).lte("date", args.to),
        )
        .take(MAX_DAYS);
      for (const mark of marks) {
        addStatus(totals, mark.status);
        addStatus(group.counts, mark.status);
        const day = byDate.get(mark.date);
        if (day) {
          addStatus(day, mark.status);
        }
      }
    }

    const fees = {
      collected: 0,
      academic: 0,
      transport: 0,
      academicDiscount: 0,
      cash: 0,
      online: 0,
      paymentCount: 0,
    };
    const expenses = { total: 0, fuel: 0, staff: 0, stock: 0, other: 0 };
    const moneyByDate = new Map<
      string,
      {
        collected: number;
        academic: number;
        transport: number;
        academicDiscount: number;
        fuel: number;
        staff: number;
        stock: number;
        other: number;
      }
    >();
    for (const date of dates) {
      moneyByDate.set(date, {
        collected: 0,
        academic: 0,
        transport: 0,
        academicDiscount: 0,
        fuel: 0,
        staff: 0,
        stock: 0,
        other: 0,
      });
    }

    if (showFees) {
      for (const student of students) {
        const payments = await ctx.db
          .query("feePayments")
          .withIndex("by_student", (q) => q.eq("studentId", student._id))
          .order("desc")
          .take(300);
        for (const payment of payments) {
          if (payment.paidOn < args.from || payment.paidOn > args.to) {
            continue;
          }
          fees.collected = roundMoney(fees.collected + payment.amount);
          fees.paymentCount += 1;
          if (payment.kind === "academic") {
            fees.academic = roundMoney(fees.academic + payment.amount);
            fees.academicDiscount = roundMoney(
              fees.academicDiscount + (payment.discountAmount ?? 0),
            );
          } else {
            fees.transport = roundMoney(fees.transport + payment.amount);
          }
          if (payment.mode === "cash") {
            fees.cash = roundMoney(fees.cash + payment.amount);
          } else if (payment.mode === "online") {
            fees.online = roundMoney(fees.online + payment.amount);
          }
          const day = moneyByDate.get(payment.paidOn);
          if (day) {
            day.collected = roundMoney(day.collected + payment.amount);
            if (payment.kind === "academic") {
              day.academic = roundMoney(day.academic + payment.amount);
              day.academicDiscount = roundMoney(
                day.academicDiscount + (payment.discountAmount ?? 0),
              );
            } else {
              day.transport = roundMoney(day.transport + payment.amount);
            }
          }
        }
      }
    }

    if (showExpenses) {
      const fills = await ctx.db
        .query("fuelPurchases")
        .withIndex("by_date", (q) =>
          q.gte("date", args.from).lte("date", args.to),
        )
        .take(2000);
      for (const fill of fills) {
        expenses.fuel = roundMoney(expenses.fuel + fill.price);
        expenses.total = roundMoney(expenses.total + fill.price);
        const day = moneyByDate.get(fill.date);
        if (day) {
          day.fuel = roundMoney(day.fuel + fill.price);
        }
      }

      const months = new Set(dates.map((date) => date.slice(0, 7)));
      for (const month of months) {
        const payments = await ctx.db
          .query("staffPayments")
          .withIndex("by_month", (q) => q.eq("month", month))
          .take(500);
        for (const payment of payments) {
          if (payment.paidOn < args.from || payment.paidOn > args.to) {
            continue;
          }
          expenses.staff = roundMoney(expenses.staff + payment.amount);
          expenses.total = roundMoney(expenses.total + payment.amount);
          const day = moneyByDate.get(payment.paidOn);
          if (day) {
            day.staff = roundMoney(day.staff + payment.amount);
          }
        }
      }

      const purchases = await ctx.db
        .query("stockPurchases")
        .withIndex("by_date", (q) =>
          q.gte("date", args.from).lte("date", args.to),
        )
        .take(2000);
      for (const purchase of purchases) {
        expenses.stock = roundMoney(expenses.stock + purchase.total);
        expenses.total = roundMoney(expenses.total + purchase.total);
        const day = moneyByDate.get(purchase.date);
        if (day) {
          day.stock = roundMoney(day.stock + purchase.total);
        }
      }

      const office = await ctx.db
        .query("officeExpenses")
        .withIndex("by_date", (q) =>
          q.gte("date", args.from).lte("date", args.to),
        )
        .take(2000);
      for (const entry of office) {
        expenses.other = roundMoney(expenses.other + entry.amount);
        expenses.total = roundMoney(expenses.total + entry.amount);
        const day = moneyByDate.get(entry.date);
        if (day) {
          day.other = roundMoney(day.other + entry.amount);
        }
      }
    }

    const bucketSize = dates.length > 31 ? 7 : 1;
    const points = [];
    for (let index = 0; index < dates.length; index += bucketSize) {
      const slice = dates.slice(index, index + bucketSize);
      const counts = emptyCounts();
      let collected = 0;
      let academic = 0;
      let transport = 0;
      let academicDiscount = 0;
      let fuel = 0;
      let staff = 0;
      let stock = 0;
      let other = 0;
      for (const date of slice) {
        const day = byDate.get(date) ?? emptyCounts();
        counts.present += day.present;
        counts.absent += day.absent;
        counts.late += day.late;
        const money = moneyByDate.get(date);
        if (money) {
          collected = roundMoney(collected + money.collected);
          academic = roundMoney(academic + money.academic);
          transport = roundMoney(transport + money.transport);
          academicDiscount = roundMoney(academicDiscount + money.academicDiscount);
          fuel = roundMoney(fuel + money.fuel);
          staff = roundMoney(staff + money.staff);
          stock = roundMoney(stock + money.stock);
          other = roundMoney(other + money.other);
        }
      }
      const last = slice[slice.length - 1] ?? slice[0];
      points.push({
        label: bucketSize === 1 ? shortLabel(slice[0]) : `${shortLabel(slice[0])}–${shortLabel(last)}`,
        present: counts.present,
        absent: counts.absent,
        late: counts.late,
        collected,
        academic,
        transport,
        academicDiscount,
        fuel,
        staff,
        stock,
        other,
      });
    }

    const groups = [...byGroup.values()]
      .map((group) => ({
        label: group.label,
        ...withRate(group.counts),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));

    return {
      scope,
      showFees,
      showExpenses,
      from: args.from,
      to: args.to,
      attendance: withRate(totals),
      groups,
      points,
      expenses,
      fees,
    };
  },
});
