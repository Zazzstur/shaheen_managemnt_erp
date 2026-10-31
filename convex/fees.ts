import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  assertStudentAccess,
  isIsoDate,
  isSchoolAdmin,
  requireRoles,
  requireRolesIncludingDataEntry,
  requireSchoolAdmin,
  requireSuperAdmin,
} from "./lib/auth";
import {
  collectionDiscountMethodValidator,
  feeListItemValidator,
  feeStatusValidator,
} from "./lib/validators";
import { studentName } from "./lib/studentName";
import {
  feeQuoteValidator,
  quoteNotes,
  quoteStudentFee,
  uniqueInvoiceNumber,
} from "./lib/feeQuote";
import { academicSchedule } from "./lib/classHistory";
import {
  academicMonthDiscounts,
  allocateCollectionDiscount,
  allocatePayment,
  buildFeeAccount,
  dueInRange,
  feeYearStartYear,
  monthKeyFromTimestamp,
  roundMoney,
} from "./lib/feeLedger";

const paymentModeValidator = v.union(v.literal("cash"), v.literal("online"));

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
    const user = await requireRolesIncludingDataEntry(ctx, [
      "super_admin",
      "parent",
      "student",
    ]);
    const result =
      args.status && isSchoolAdmin(user)
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
    await requireSchoolAdmin(ctx);
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
    const user = await requireRolesIncludingDataEntry(ctx, [
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
      discount: v.number(),
      balance: v.number(),
      coverage: coverageValidator,
    }),
  ),
});

const feeStatementValidator = v.object({
  studentId: v.id("students"),
  studentName: v.string(),
  admissionNumber: v.string(),
  // Admission form stores the father's name in guardianName.
  fatherName: v.optional(v.string()),
  classLabel: v.string(),
  year: v.string(),
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
      discountAmount: v.optional(v.number()),
      discountReason: v.optional(v.string()),
      discountMethod: v.optional(collectionDiscountMethodValidator),
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

function laterMonth(left: string, right: string) {
  return left > right ? left : right;
}

async function invoicePaymentsTotal(ctx: QueryCtx, studentId: Id<"students">) {
  const invoices = await ctx.db
    .query("fees")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .take(50);
  return roundMoney(
    invoices.reduce((sum, fee) => sum + (fee.paidAmount ?? 0), 0),
  );
}

function trimmed(value: string | undefined) {
  const text = value?.trim();
  return text ? text : undefined;
}

async function collectionDiscountForSettlement(
  ctx: QueryCtx,
  student: Doc<"students">,
  args: {
    kind: "academic" | "transport";
    amount: number;
    paidOn: string;
    discountAmount?: number;
    discountReason?: string;
    discountMethod?: "equal" | "first" | "last";
  },
) {
  const raw = args.discountAmount ?? 0;
  if (!Number.isFinite(raw) || raw < 0) {
    throw new Error("Discount must be zero or greater");
  }
  const discount = roundMoney(raw);
  if (discount === 0) {
    return null;
  }
  if (args.kind !== "academic") {
    throw new Error("Discounts apply to academic fee collection only");
  }
  if (discount > 10_000_000) {
    throw new Error("Discount is too large");
  }
  if (discount > roundMoney(args.amount)) {
    throw new Error(
      "Discount cannot be larger than the amount being collected",
    );
  }
  const method = args.discountMethod ?? "equal";
  const reason = args.discountReason?.trim() ?? "";
  if (!reason) {
    throw new Error("Enter a reason for the discount");
  }
  if (reason.length > 200) {
    throw new Error("Discount reason must be 200 characters or less");
  }
  const schedule = await academicSchedule(ctx, student, args.paidOn);
  const payments = await ctx.db
    .query("feePayments")
    .withIndex("by_student", (q) => q.eq("studentId", student._id))
    .take(200);
  let paid = await invoicePaymentsTotal(ctx, student._id);
  for (const payment of payments) {
    if (payment.kind === "academic") {
      paid = roundMoney(paid + payment.amount);
    }
  }
  const account = buildFeeAccount({
    monthlyRate: schedule.monthlyRate,
    ...(schedule.monthCharges ? { monthCharges: schedule.monthCharges } : {}),
    monthDiscounts: academicMonthDiscounts(payments),
    paid,
    fromMonth: schedule.fromMonth,
    throughMonth: schedule.throughMonth,
    asOfMonth: schedule.asOfMonth,
    feeYearStart: schedule.feeYearStart,
  });
  return {
    amount: discount,
    reason,
    method,
    lines: allocateCollectionDiscount({
      method,
      discount,
      amount: roundMoney(args.amount),
      months: account.months,
    }),
  };
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
  const schedule = await academicSchedule(ctx, student, asOf);
  const classroom = schedule.classroom;
  const { feeYearStart, feeYearLabel, asOfMonth, fromMonth, throughMonth } =
    schedule;

  const academicEarlierPayments = await invoicePaymentsTotal(
    ctx,
    student._id,
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
      academicPayments.push({
        ...row,
        ...(payment.discountAmount
          ? {
              discountAmount: payment.discountAmount,
              ...(payment.discountReason
                ? { discountReason: payment.discountReason }
                : {}),
              ...(payment.discountMethod
                ? { discountMethod: payment.discountMethod }
                : {}),
            }
          : {}),
      });
    }
  }
  academicPayments.sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  transportPayments.sort((a, b) => b.paidOn.localeCompare(a.paidOn));

  const academic = buildFeeAccount({
    monthlyRate: schedule.monthlyRate,
    ...(schedule.monthCharges ? { monthCharges: schedule.monthCharges } : {}),
    monthDiscounts: academicMonthDiscounts(payments),
    paid: academicPaid,
    fromMonth,
    throughMonth,
    asOfMonth,
    feeYearStart,
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
    fromMonth: assignment ? transportFromMonth : `${feeYearStart + 1}-04`,
    throughMonth,
    asOfMonth,
    feeYearStart,
  });

  const fatherName = trimmed(student.guardianName);

  return {
    studentId: student._id,
    studentName: studentName(student),
    admissionNumber: student.admissionNumber,
    ...(fatherName ? { fatherName } : {}),
    classLabel: `${classroom.name} ${classroom.section}`.trim(),
    year: feeYearLabel,
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

const MAX_FEE_SEARCH_LENGTH = 100;

function normalizeFeeSearchTerm(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, MAX_FEE_SEARCH_LENGTH);
}

function matchesFeeSearch(student: Doc<"students">, term: string) {
  if (student.status !== "enrolled") {
    return false;
  }
  if (!term) {
    return true;
  }
  const name = studentName(student).toLowerCase().replace(/\s+/g, " ").trim();
  const admission = student.admissionNumber.toLowerCase().replace(/\s+/g, "");
  const admissionTerm = term.replace(/ /g, "");
  return (
    name.includes(term) ||
    (admissionTerm.length > 0 && admission.includes(admissionTerm))
  );
}

async function enrolledStudentsForFeeSearch(
  ctx: QueryCtx,
  classId: Id<"classes"> | undefined,
) {
  const students = classId
    ? await ctx.db
        .query("students")
        .withIndex("by_class", (q) => q.eq("classId", classId))
        .collect()
    : await ctx.db.query("students").collect();
  return students.filter((student) => student.status === "enrolled");
}

export const searchStudents = query({
  args: { term: v.string() },
  returns: v.array(searchHitValidator),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const term = normalizeFeeSearchTerm(args.term);
    if (term.length < 1) {
      return [];
    }
    const students = await enrolledStudentsForFeeSearch(ctx, undefined);
    const classLabels = new Map<Id<"classes">, string>();
    const hits = [];
    for (const student of students) {
      if (!matchesFeeSearch(student, term)) {
        continue;
      }
      let classLabel = classLabels.get(student.classId);
      if (classLabel === undefined) {
        const classroom = await ctx.db.get("classes", student.classId);
        classLabel = classroom
          ? `${classroom.name} ${classroom.section}`.trim()
          : "Unassigned";
        classLabels.set(student.classId, classLabel);
      }
      const name = studentName(student);
      hits.push({
        studentId: student._id,
        studentName: name,
        admissionNumber: student.admissionNumber,
        classLabel,
      });
    }
    hits.sort((a, b) => a.studentName.localeCompare(b.studentName));
    return hits;
  },
});

const filterHitValidator = v.object({
  studentId: v.id("students"),
  studentName: v.string(),
  admissionNumber: v.string(),
  classLabel: v.string(),
  totalDue: v.optional(v.number()),
});

export const filterStudents = query({
  args: {
    asOf: v.string(),
    term: v.string(),
    classId: v.optional(v.id("classes")),
    feeStatus: v.union(v.literal("all"), v.literal("due"), v.literal("paid")),
  },
  returns: v.array(filterHitValidator),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    if (!isIsoDate(args.asOf)) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    const term = normalizeFeeSearchTerm(args.term);
    if (!args.classId && !term) {
      return [];
    }
    const students = await enrolledStudentsForFeeSearch(ctx, args.classId);
    const classLabels = new Map<Id<"classes">, string | null>();
    const hits = [];
    for (const student of students) {
      const name = studentName(student);
      if (term && !matchesFeeSearch(student, term)) {
        continue;
      }
      let classLabel = classLabels.get(student.classId);
      if (classLabel === undefined) {
        const classroom = await ctx.db.get("classes", student.classId);
        classLabel = classroom
          ? `${classroom.name} ${classroom.section}`.trim()
          : null;
        classLabels.set(student.classId, classLabel);
      }
      if (classLabel === null) {
        continue;
      }
      if (args.feeStatus === "all") {
        hits.push({
          studentId: student._id,
          studentName: name,
          admissionNumber: student.admissionNumber,
          classLabel,
        });
        continue;
      }
      const statement = await loadFeeStatement(ctx, student._id, args.asOf);
      const totalDue = roundMoney(
        statement.academic.due + statement.transport.due,
      );
      if ((args.feeStatus === "due") !== totalDue > 0) {
        continue;
      }
      hits.push({
        studentId: student._id,
        studentName: statement.studentName,
        admissionNumber: statement.admissionNumber,
        classLabel: statement.classLabel,
        totalDue,
      });
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
    const user = await requireRolesIncludingDataEntry(ctx, [
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
    mode: v.optional(paymentModeValidator),
    discountAmount: v.optional(v.number()),
    discountReason: v.optional(v.string()),
    discountMethod: v.optional(collectionDiscountMethodValidator),
  },
  returns: v.id("feePayments"),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    if (!isIsoDate(args.paidOn)) {
      throw new Error("Payment date must be YYYY-MM-DD");
    }
    if (!args.mode) {
      throw new Error("Choose a payment mode: cash or online");
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
    const discount = await collectionDiscountForSettlement(ctx, student, args);
    const note = args.note?.trim();
    return await ctx.db.insert("feePayments", {
      studentId: args.studentId,
      kind: args.kind,
      amount: roundMoney(args.amount),
      paidOn: args.paidOn,
      note: note ? note.slice(0, 200) : undefined,
      mode: args.mode,
      ...(discount
        ? {
            discountAmount: discount.amount,
            discountReason: discount.reason,
            discountMethod: discount.method,
            discountLines: discount.lines,
          }
        : {}),
    });
  },
});

const paymentInvoiceValidator = v.object({
  paymentId: v.id("feePayments"),
  kind: v.union(v.literal("academic"), v.literal("transport")),
  paidOn: v.string(),
  mode: v.optional(paymentModeValidator),
  amount: v.number(),
  studentName: v.string(),
  admissionNumber: v.string(),
  classLabel: v.string(),
  session: v.string(),
  fatherName: v.optional(v.string()),
  fatherPhone: v.optional(v.string()),
  motherName: v.optional(v.string()),
  motherPhone: v.optional(v.string()),
  dueBefore: v.number(),
  dueAfter: v.number(),
  advanceAfter: v.number(),
  lines: v.array(
    v.object({
      month: v.string(),
      label: v.string(),
      charge: v.number(),
      dueBefore: v.number(),
      paid: v.number(),
      discount: v.number(),
    }),
  ),
  unallocated: v.number(),
  discountAmount: v.optional(v.number()),
  discountReason: v.optional(v.string()),
  discountMethod: v.optional(collectionDiscountMethodValidator),
});

export const paymentInvoice = query({
  args: { paymentId: v.id("feePayments") },
  returns: paymentInvoiceValidator,
  handler: async (ctx, args) => {
    const user = await requireRolesIncludingDataEntry(ctx, [
      "super_admin",
      "parent",
      "student",
    ]);
    const payment = await ctx.db.get("feePayments", args.paymentId);
    if (!payment) {
      throw new Error("Payment not found");
    }
    const student = await assertStudentAccess(ctx, payment.studentId, user);
    const schedule = await academicSchedule(ctx, student, payment.paidOn);
    const classroom = schedule.classroom;

    const { feeYearStart, feeYearLabel, asOfMonth, fromMonth, throughMonth } =
      schedule;
    let monthlyRate = schedule.monthlyRate;
    let monthCharges = schedule.monthCharges;
    let chargeFrom = fromMonth;
    if (payment.kind === "transport") {
      monthCharges = undefined;
      const assignment = await ctx.db
        .query("studentTransport")
        .withIndex("by_student", (q) => q.eq("studentId", student._id))
        .unique();
      if (!assignment) {
        throw new Error("This student is not assigned to a transport route");
      }
      const route = await ctx.db.get("transportRoutes", assignment.routeId);
      monthlyRate = assignment.customFee ?? route?.defaultFee ?? 0;
      chargeFrom = laterMonth(
        monthKeyFromTimestamp(assignment._creationTime),
        fromMonth,
      );
    }

    const payments = await ctx.db
      .query("feePayments")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .take(200);
    let paidBefore =
      payment.kind === "academic"
        ? await invoicePaymentsTotal(ctx, student._id)
        : 0;
    for (const other of payments) {
      if (
        other.kind === payment.kind &&
        other._creationTime < payment._creationTime
      ) {
        paidBefore = roundMoney(paidBefore + other.amount);
      }
    }

    const earlierPayments = payments.filter(
      (other) => other._creationTime < payment._creationTime,
    );
    const discountsBefore =
      payment.kind === "academic"
        ? academicMonthDiscounts(earlierPayments)
        : undefined;
    const discountsAfter =
      payment.kind === "academic"
        ? academicMonthDiscounts([...earlierPayments, payment])
        : undefined;
    const accountArgs = {
      monthlyRate,
      ...(monthCharges ? { monthCharges } : {}),
      fromMonth: chargeFrom,
      throughMonth,
      asOfMonth,
    };
    const before = buildFeeAccount({
      ...accountArgs,
      ...(discountsBefore ? { monthDiscounts: discountsBefore } : {}),
      paid: paidBefore,
      feeYearStart,
    });
    const after = buildFeeAccount({
      ...accountArgs,
      ...(discountsAfter ? { monthDiscounts: discountsAfter } : {}),
      paid: roundMoney(paidBefore + payment.amount),
      feeYearStart,
    });
    const allocation = allocatePayment({
      monthlyRate,
      ...(monthCharges ? { monthCharges } : {}),
      ...(discountsAfter ? { monthDiscounts: discountsAfter } : {}),
      paidBefore,
      amount: payment.amount,
      fromMonth: chargeFrom,
      throughMonth,
    });

    const fatherName = trimmed(student.guardianName);
    const fatherPhone = trimmed(student.guardianPhone);
    const motherName = trimmed(student.motherName);
    const motherPhone = trimmed(student.motherPhone);

    const discountByMonth = new Map(
      (payment.discountLines ?? []).map((line) => [line.month, line.amount]),
    );
    const lines = allocation.lines.map((line) => {
      const prior = before.months.find((month) => month.month === line.month);
      return {
        ...line,
        dueBefore: prior?.balance ?? line.dueBefore,
        discount: discountByMonth.get(line.month) ?? 0,
      };
    });
    for (const extra of payment.discountLines ?? []) {
      if (extra.amount <= 0 || lines.some((line) => line.month === extra.month)) {
        continue;
      }
      const prior = before.months.find((month) => month.month === extra.month);
      lines.push({
        month: extra.month,
        label: prior?.label ?? extra.month,
        charge: prior?.charge ?? 0,
        dueBefore: prior?.balance ?? extra.amount,
        paid: 0,
        discount: extra.amount,
      });
    }
    lines.sort((left, right) => left.month.localeCompare(right.month));

    return {
      paymentId: payment._id,
      kind: payment.kind,
      paidOn: payment.paidOn,
      ...(payment.mode ? { mode: payment.mode } : {}),
      amount: payment.amount,
      studentName: studentName(student),
      admissionNumber: student.admissionNumber,
      classLabel: `${classroom.name} ${classroom.section}`.trim(),
      session: feeYearLabel,
      ...(fatherName ? { fatherName } : {}),
      ...(fatherPhone ? { fatherPhone } : {}),
      ...(motherName ? { motherName } : {}),
      ...(motherPhone ? { motherPhone } : {}),
      dueBefore: before.due,
      dueAfter: after.due,
      advanceAfter: after.advance,
      lines,
      unallocated: allocation.unallocated,
      ...(payment.discountAmount
        ? {
            discountAmount: payment.discountAmount,
            ...(payment.discountReason
              ? { discountReason: payment.discountReason }
              : {}),
            ...(payment.discountMethod
              ? { discountMethod: payment.discountMethod }
              : {}),
          }
        : {}),
    };
  },
});

function assertDateRange(from: string, to: string) {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new Error("Dates must be YYYY-MM-DD");
  }
  if (from > to) {
    throw new Error("Start date must be on or before the end date");
  }
}

async function enrolledStudents(
  ctx: QueryCtx,
  classId: Id<"classes"> | undefined,
) {
  const students = classId
    ? await ctx.db
        .query("students")
        .withIndex("by_class", (q) => q.eq("classId", classId))
        .take(500)
    : await ctx.db.query("students").take(500);
  return students.filter((student) => student.status === "enrolled");
}

export const schoolSnapshot = query({
  args: {
    asOf: v.string(),
    collectionFrom: v.string(),
    collectionTo: v.string(),
  },
  returns: v.object({
    monthlyCollection: v.number(),
    paymentCount: v.number(),
    totalDue: v.number(),
    studentsWithDue: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    assertDateRange(args.collectionFrom, args.collectionTo);
    if (!isIsoDate(args.asOf)) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    const students = await enrolledStudents(ctx, undefined);
    const dueFromMonth = `${feeYearStartYear(args.asOf)}-04`;
    const dueToMonth = args.asOf.slice(0, 7);
    let monthlyCollection = 0;
    let paymentCount = 0;
    let totalDue = 0;
    let studentsWithDue = 0;

    for (const student of students) {
      const statement = await loadFeeStatement(ctx, student._id, args.asOf);
      const due = roundMoney(
        dueInRange(statement.academic, dueFromMonth, dueToMonth) +
          dueInRange(statement.transport, dueFromMonth, dueToMonth),
      );
      if (due > 0) {
        totalDue = roundMoney(totalDue + due);
        studentsWithDue += 1;
      }
      const payments = await ctx.db
        .query("feePayments")
        .withIndex("by_student", (q) => q.eq("studentId", student._id))
        .take(200);
      for (const payment of payments) {
        if (
          payment.paidOn >= args.collectionFrom &&
          payment.paidOn <= args.collectionTo
        ) {
          monthlyCollection = roundMoney(monthlyCollection + payment.amount);
          paymentCount += 1;
        }
      }
    }

    return { monthlyCollection, paymentCount, totalDue, studentsWithDue };
  },
});

const collectionRowValidator = v.object({
  paymentId: v.id("feePayments"),
  paidOn: v.string(),
  studentName: v.string(),
  admissionNumber: v.string(),
  classLabel: v.string(),
  kind: v.union(v.literal("academic"), v.literal("transport")),
  mode: v.optional(paymentModeValidator),
  amount: v.number(),
});

export const collectionReport = query({
  args: {
    from: v.string(),
    to: v.string(),
    classId: v.optional(v.id("classes")),
  },
  returns: v.object({
    total: v.number(),
    rows: v.array(collectionRowValidator),
  }),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    assertDateRange(args.from, args.to);
    const students = await enrolledStudents(ctx, args.classId);
    const rows = [];
    let total = 0;
    for (const student of students) {
      const classroom = await ctx.db.get("classes", student.classId);
      if (!classroom) {
        continue;
      }
      const payments = await ctx.db
        .query("feePayments")
        .withIndex("by_student", (q) => q.eq("studentId", student._id))
        .take(200);
      for (const payment of payments) {
        if (payment.paidOn < args.from || payment.paidOn > args.to) {
          continue;
        }
        total = roundMoney(total + payment.amount);
        rows.push({
          paymentId: payment._id,
          paidOn: payment.paidOn,
          studentName: studentName(student),
          admissionNumber: student.admissionNumber,
          classLabel: `${classroom.name} ${classroom.section}`.trim(),
          kind: payment.kind,
          ...(payment.mode ? { mode: payment.mode } : {}),
          amount: payment.amount,
        });
      }
    }
    rows.sort((left, right) => {
      const byDate = right.paidOn.localeCompare(left.paidOn);
      if (byDate !== 0) {
        return byDate;
      }
      return left.studentName.localeCompare(right.studentName);
    });
    return { total, rows };
  },
});

const dueRowValidator = v.object({
  studentId: v.id("students"),
  studentName: v.string(),
  admissionNumber: v.string(),
  classLabel: v.string(),
  fatherPhone: v.optional(v.string()),
  motherPhone: v.optional(v.string()),
  academicDue: v.number(),
  transportDue: v.number(),
  due: v.number(),
});

export const dueReport = query({
  args: {
    from: v.string(),
    to: v.string(),
    classId: v.optional(v.id("classes")),
  },
  returns: v.object({
    totalDue: v.number(),
    rows: v.array(dueRowValidator),
  }),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    assertDateRange(args.from, args.to);
    const fromMonth = args.from.slice(0, 7);
    const toMonth = args.to.slice(0, 7);
    const students = await enrolledStudents(ctx, args.classId);
    const rows = [];
    let totalDue = 0;
    for (const student of students) {
      const statement = await loadFeeStatement(ctx, student._id, args.to);
      const academicDue = dueInRange(statement.academic, fromMonth, toMonth);
      const transportDue = dueInRange(statement.transport, fromMonth, toMonth);
      const due = roundMoney(academicDue + transportDue);
      if (due <= 0) {
        continue;
      }
      totalDue = roundMoney(totalDue + due);
      const fatherPhone = trimmed(student.guardianPhone);
      const motherPhone = trimmed(student.motherPhone);
      rows.push({
        studentId: student._id,
        studentName: statement.studentName,
        admissionNumber: statement.admissionNumber,
        classLabel: statement.classLabel,
        ...(fatherPhone ? { fatherPhone } : {}),
        ...(motherPhone ? { motherPhone } : {}),
        academicDue,
        transportDue,
        due,
      });
    }
    rows.sort(
      (left, right) =>
        right.due - left.due ||
        left.studentName.localeCompare(right.studentName),
    );
    return { totalDue, rows };
  },
});

const feeExportRowValidator = v.object({
  admissionNumber: v.string(),
  studentName: v.string(),
  classLabel: v.string(),
  academicMonthlyFee: v.number(),
  academicPaid: v.number(),
  academicDue: v.number(),
  transportRoute: v.string(),
  transportMonthlyFee: v.number(),
  transportPaid: v.number(),
  transportDue: v.number(),
  totalPaid: v.number(),
  totalDue: v.number(),
});

export const exportRows = query({
  args: { asOf: v.string() },
  returns: v.array(feeExportRowValidator),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    if (!isIsoDate(args.asOf)) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    const students = await enrolledStudents(ctx, undefined);
    const rows = [];
    for (const student of students) {
      const classroom = await ctx.db.get("classes", student.classId);
      if (!classroom) {
        continue;
      }
      const statement = await loadFeeStatement(ctx, student._id, args.asOf);
      rows.push({
        admissionNumber: statement.admissionNumber,
        studentName: statement.studentName,
        classLabel: statement.classLabel,
        academicMonthlyFee: statement.academic.monthlyRate,
        academicPaid: statement.academic.paid,
        academicDue: statement.academic.due,
        transportRoute: statement.transportRouteName ?? "",
        transportMonthlyFee: statement.transport.monthlyRate,
        transportPaid: statement.transport.paid,
        transportDue: statement.transport.due,
        totalPaid: roundMoney(statement.academic.paid + statement.transport.paid),
        totalDue: roundMoney(statement.academic.due + statement.transport.due),
      });
    }
    rows.sort((left, right) =>
      left.studentName.localeCompare(right.studentName),
    );
    return rows;
  },
});

export const invoiceMessage = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireSchoolAdmin(ctx);
    const notice = await ctx.db.query("invoiceNotice").first();
    return notice?.message ?? "";
  },
});

export const setInvoiceMessage = mutation({
  args: { message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const message = args.message.trim().slice(0, 500);
    const notice = await ctx.db.query("invoiceNotice").first();
    if (notice) {
      await ctx.db.patch("invoiceNotice", notice._id, { message });
    } else {
      await ctx.db.insert("invoiceNotice", { message });
    }
    return null;
  },
});

