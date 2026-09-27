import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  assertStudentAccess,
  isIsoDate,
  requireRoles,
  requireSuperAdmin,
} from "./lib/auth";
import { feeListItemValidator, feeStatusValidator } from "./lib/validators";
import { studentName } from "./lib/studentName";
import {
  feeQuoteValidator,
  quoteNotes,
  quoteStudentFee,
  uniqueInvoiceNumber,
} from "./lib/feeQuote";
import {
  buildFeeAccount,
  monthKeyFromTimestamp,
  roundMoney,
  scheduleStartYear,
} from "./lib/feeLedger";

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(feeStatusValidator),
  },
  returns: v.object({
    page: v.array(feeListItemValidator),
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
    const user = await requireRoles(ctx, [
      "super_admin",
      "parent",
      "student",
    ]);
    const result =
      args.status && user.role === "super_admin"
        ? await ctx.db
            .query("fees")
            .withIndex("by_status", (q) => q.eq("status", args.status!))
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db.query("fees").order("desc").paginate(args.paginationOpts);

    const page = [];
    for (const fee of result.page) {
      const student = await ctx.db.get("students", fee.studentId);
      if (!student) {
        continue;
      }
      if (user.role === "student" && student.userId !== user._id) {
        continue;
      }
      if (user.role === "parent" && student.guardianUserId !== user._id) {
        continue;
      }
      page.push({
        ...fee,
        studentName: studentName(student),
        admissionNumber: student.admissionNumber,
      });
    }
    return { ...result, page };
  },
});

export const quoteForStudent = query({
  args: { studentId: v.id("students") },
  returns: feeQuoteValidator,
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    return await quoteStudentFee(ctx, args.studentId);
  },
});

export const create = mutation({
  args: {
    studentId: v.id("students"),
    dueDate: v.string(),
    notes: v.optional(v.string()),
  },
  returns: v.id("fees"),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    if (!isIsoDate(args.dueDate)) {
      throw new Error("Due date must be YYYY-MM-DD");
    }
    const student = await ctx.db.get("students", args.studentId);
    if (!student) {
      throw new Error("Student not found");
    }
    const quote = await quoteStudentFee(ctx, args.studentId);
    if (quote.total <= 0) {
      throw new Error(
        "No fees to invoice. Set a class fee structure or assign transport first.",
      );
    }
    const invoiceNumber = await uniqueInvoiceNumber(
      ctx,
      student,
      args.dueDate,
    );
    return await ctx.db.insert("fees", {
      studentId: args.studentId,
      amount: quote.total,
      dueDate: args.dueDate,
      status: "pending",
      invoiceNumber,
      paidAmount: 0,
      notes: quoteNotes(quote, args.notes),
    });
  },
});

export const recordPayment = mutation({
  args: {
    feeId: v.id("fees"),
    paidAmount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRoles(ctx, ["super_admin"]);
    if (!Number.isFinite(args.paidAmount) || args.paidAmount < 0) {
      throw new Error("Paid amount must be zero or greater");
    }
    const fee = await ctx.db.get("fees", args.feeId);
    if (!fee) {
      throw new Error("Fee record not found");
    }
    await assertStudentAccess(ctx, fee.studentId, user);
    let status: "pending" | "paid" | "partial" = "pending";
    if (args.paidAmount >= fee.amount) {
      status = "paid";
    } else if (args.paidAmount > 0) {
      status = "partial";
    }
    await ctx.db.patch("fees", args.feeId, {
      paidAmount: args.paidAmount,
      status,
      lastPaymentAt: Date.now(),
    });
    return null;
  },
});

export const summary = query({
  args: {
    monthStart: v.number(),
    monthEnd: v.number(),
  },
  returns: v.object({
    totalDue: v.number(),
    dueInvoiceCount: v.number(),
    monthlyCollection: v.number(),
    monthlyPaymentCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireRoles(ctx, [
      "super_admin",
      "parent",
      "student",
    ]);
    const fees = await ctx.db.query("fees").take(200);
    let totalDue = 0;
    let dueInvoiceCount = 0;
    let monthlyCollection = 0;
    let monthlyPaymentCount = 0;

    for (const fee of fees) {
      const student = await ctx.db.get("students", fee.studentId);
      if (!student) {
        continue;
      }
      if (user.role === "student" && student.userId !== user._id) {
        continue;
      }
      if (user.role === "parent" && student.guardianUserId !== user._id) {
        continue;
      }

      const paid = fee.paidAmount ?? 0;
      const remaining = fee.amount - paid;
      if (remaining > 0) {
        totalDue += remaining;
        dueInvoiceCount += 1;
      }

      if (paid > 0) {
        const collectedAt = fee.lastPaymentAt ?? fee._creationTime;
        if (
          collectedAt >= args.monthStart &&
          collectedAt < args.monthEnd
        ) {
          monthlyCollection += paid;
          monthlyPaymentCount += 1;
        }
      }
    }

    return {
      totalDue,
      dueInvoiceCount,
      monthlyCollection,
      monthlyPaymentCount,
    };
  },
});

const coverageValidator = v.union(
  v.literal("paid"),
  v.literal("partial"),
  v.literal("due"),
  v.literal("upcoming"),
  v.literal("advance"),
);

const feeAccountValidator = v.object({
  monthlyRate: v.number(),
  chargedToDate: v.number(),
  paid: v.number(),
  due: v.number(),
  advance: v.number(),
  yearTotal: v.number(),
  priorDue: v.number(),
  months: v.array(
    v.object({
      month: v.string(),
      label: v.string(),
      charge: v.number(),
      applied: v.number(),
      balance: v.number(),
      coverage: coverageValidator,
    }),
  ),
});

const feeStatementValidator = v.object({
  studentId: v.id("students"),
  studentName: v.string(),
  admissionNumber: v.string(),
  classLabel: v.string(),
  year: v.number(),
  academicEarlierPayments: v.number(),
  academic: feeAccountValidator,
  transportAssigned: v.boolean(),
  transportRouteName: v.optional(v.string()),
  transportFromMonth: v.optional(v.string()),
  transport: feeAccountValidator,
  academicPayments: v.array(
    v.object({
      id: v.id("feePayments"),
      amount: v.number(),
      paidOn: v.string(),
      note: v.optional(v.string()),
    }),
  ),
  transportPayments: v.array(
    v.object({
      id: v.id("feePayments"),
      amount: v.number(),
      paidOn: v.string(),
      note: v.optional(v.string()),
    }),
  ),
});

const searchHitValidator = v.object({
  studentId: v.id("students"),
  studentName: v.string(),
  admissionNumber: v.string(),
  classLabel: v.string(),
});

function academicMonthlyRate(
  classroom: Doc<"classes">,
  student: Doc<"students">,
) {
  const tuition = classroom.baseTuitionFee ?? 0;
  const extras = (classroom.extraFees ?? []).reduce(
    (sum, fee) => sum + (fee.amount > 0 ? fee.amount : 0),
    0,
  );
  const cycleTotal = tuition + extras;
  const monthly =
    classroom.tuitionCycle === "annual" ? cycleTotal / 12 : cycleTotal;
  const value = student.discountValue ?? 0;
  if (value <= 0 || monthly <= 0) {
    return roundMoney(Math.max(0, monthly));
  }
  const discount =
    student.discountType === "percent" ? (monthly * value) / 100 : value;
  return roundMoney(Math.max(0, monthly - Math.min(monthly, discount)));
}

function laterMonth(left: string, right: string) {
  return left > right ? left : right;
}

async function loadFeeStatement(
  ctx: QueryCtx,
  studentId: Id<"students">,
  asOf: string,
) {
  const student = await ctx.db.get("students", studentId);
  if (!student || student.status !== "enrolled") {
    throw new Error("Student not found");
  }
  const classroom = await ctx.db.get("classes", student.classId);
  if (!classroom) {
    throw new Error("Class not found for this student");
  }

  const viewYear = Number(asOf.slice(0, 4));
  const asOfMonth = asOf.slice(0, 7);
  const startYear = scheduleStartYear(classroom.academicYear, viewYear);
  const fromMonth = `${startYear}-01`;
  const throughMonth = `${viewYear}-12`;

  const invoices = await ctx.db
    .query("fees")
    .withIndex("by_student", (q) => q.eq("studentId", student._id))
    .take(50);
  const academicEarlierPayments = roundMoney(
    invoices.reduce((sum, fee) => sum + (fee.paidAmount ?? 0), 0),
  );

  const payments = await ctx.db
    .query("feePayments")
    .withIndex("by_student", (q) => q.eq("studentId", student._id))
    .take(200);

  let academicPaid = academicEarlierPayments;
  let transportPaid = 0;
  const academicPayments = [];
  const transportPayments = [];
  for (const payment of payments) {
    const row = {
      id: payment._id,
      amount: payment.amount,
      paidOn: payment.paidOn,
      ...(payment.note ? { note: payment.note } : {}),
    };
    if (payment.kind === "transport") {
      transportPaid = roundMoney(transportPaid + payment.amount);
      transportPayments.push(row);
    } else {
      academicPaid = roundMoney(academicPaid + payment.amount);
      academicPayments.push(row);
    }
  }
  academicPayments.sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  transportPayments.sort((a, b) => b.paidOn.localeCompare(a.paidOn));

  const academic = buildFeeAccount({
    monthlyRate: academicMonthlyRate(classroom, student),
    paid: academicPaid,
    fromMonth,
    throughMonth,
    asOfMonth,
    displayYear: viewYear,
  });

  const assignment = await ctx.db
    .query("studentTransport")
    .withIndex("by_student", (q) => q.eq("studentId", student._id))
    .unique();
  const route = assignment
    ? await ctx.db.get("transportRoutes", assignment.routeId)
    : null;
  const transportMonthly = assignment
    ? (assignment.customFee ?? route?.defaultFee ?? 0)
    : 0;
  const transportFromMonth = assignment
    ? laterMonth(monthKeyFromTimestamp(assignment._creationTime), fromMonth)
    : fromMonth;

  const transport = buildFeeAccount({
    monthlyRate: assignment ? transportMonthly : 0,
    paid: transportPaid,
    fromMonth: assignment ? transportFromMonth : `${viewYear + 1}-01`,
    throughMonth,
    asOfMonth,
    displayYear: viewYear,
  });

  return {
    studentId: student._id,
    studentName: studentName(student),
    admissionNumber: student.admissionNumber,
    classLabel: `${classroom.name} ${classroom.section}`.trim(),
    year: viewYear,
    academicEarlierPayments,
    academic,
    transportAssigned: assignment !== null,
    ...(route?.name ? { transportRouteName: route.name } : {}),
    ...(assignment ? { transportFromMonth } : {}),
    transport,
    academicPayments,
    transportPayments,
  };
}

export const searchStudents = query({
  args: { term: v.string() },
  returns: v.array(searchHitValidator),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const term = args.term.trim().toLowerCase();
    if (term.length < 1) {
      return [];
    }
    const students = await ctx.db.query("students").take(200);
    const hits = [];
    for (const student of students) {
      if (student.status !== "enrolled") {
        continue;
      }
      const name = studentName(student);
      const haystack = `${name} ${student.admissionNumber}`.toLowerCase();
      if (!haystack.includes(term)) {
        continue;
      }
      const classroom = await ctx.db.get("classes", student.classId);
      hits.push({
        studentId: student._id,
        studentName: name,
        admissionNumber: student.admissionNumber,
        classLabel: classroom
          ? `${classroom.name} ${classroom.section}`.trim()
          : "Unassigned",
      });
      if (hits.length >= 12) {
        break;
      }
    }
    hits.sort((a, b) => a.studentName.localeCompare(b.studentName));
    return hits;
  },
});

export const statement = query({
  args: {
    studentId: v.id("students"),
    asOf: v.string(),
  },
  returns: feeStatementValidator,
  handler: async (ctx, args) => {
    const user = await requireRoles(ctx, [
      "super_admin",
      "parent",
      "student",
    ]);
    if (!isIsoDate(args.asOf)) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    await assertStudentAccess(ctx, args.studentId, user);
    return await loadFeeStatement(ctx, args.studentId, args.asOf);
  },
});

export const myStatements = query({
  args: { asOf: v.string() },
  returns: v.array(feeStatementValidator),
  handler: async (ctx, args) => {
    const user = await requireRoles(ctx, ["parent", "student"]);
    if (!isIsoDate(args.asOf)) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    const students =
      user.role === "student"
        ? await ctx.db
            .query("students")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .take(5)
        : await ctx.db
            .query("students")
            .withIndex("by_guardian", (q) =>
              q.eq("guardianUserId", user._id),
            )
            .take(10);

    const statements = [];
    for (const student of students) {
      if (student.status !== "enrolled") {
        continue;
      }
      statements.push(await loadFeeStatement(ctx, student._id, args.asOf));
    }
    return statements;
  },
});

export const recordSettlement = mutation({
  args: {
    studentId: v.id("students"),
    kind: v.union(v.literal("academic"), v.literal("transport")),
    amount: v.number(),
    paidOn: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    if (!isIsoDate(args.paidOn)) {
      throw new Error("Payment date must be YYYY-MM-DD");
    }
    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }
    if (args.amount > 10_000_000) {
      throw new Error("Amount is too large");
    }
    const student = await ctx.db.get("students", args.studentId);
    if (!student || student.status !== "enrolled") {
      throw new Error("Student not found");
    }
    if (args.kind === "transport") {
      const assignment = await ctx.db
        .query("studentTransport")
        .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
        .unique();
      if (!assignment) {
        throw new Error("This student is not assigned to a transport route");
      }
    }
    const note = args.note?.trim();
    await ctx.db.insert("feePayments", {
      studentId: args.studentId,
      kind: args.kind,
      amount: roundMoney(args.amount),
      paidOn: args.paidOn,
      note: note ? note.slice(0, 200) : undefined,
    });
    return null;
  },
});

