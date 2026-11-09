import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import {
  isIsoDate,
  requireSchoolAdmin,
  requireSchoolViewer,
  signsInAsStaff,
} from "./lib/auth";
import { staffRoleValidator, userStatusValidator } from "./lib/validators";

const MAX_MONTHLY_SALARY = 10_000_000;

const staffRowValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  roleLabel: v.string(),
  status: userStatusValidator,
  monthlySalary: v.optional(v.number()),
  joiningDate: v.optional(v.string()),
});

function displayName(user: { name?: string; email?: string }) {
  const name = user.name?.trim();
  if (name) {
    return name;
  }
  return user.email?.trim() || "Unnamed staff";
}

function roleLabel(user: Doc<"users">) {
  if (user.role === "super_admin") {
    return "Super admin";
  }
  if (user.staffRole === "class_teacher") {
    return "Class teacher";
  }
  if (user.staffRole === "data_entry") {
    return "Data entry";
  }
  if (user.staffRole === "incharge") {
    return "Incharge";
  }
  if (user.staffRole === "driver") {
    return "Driver";
  }
  if (user.staffRole === "staff") {
    return "Staff";
  }
  if (user.staffRole === "observer") {
    return "Observer";
  }
  return "Teacher";
}

function isCalendarDate(value: string) {
  if (!isIsoDate(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseEmployment(monthlySalary: number, joiningDate: string) {
  if (!isCalendarDate(joiningDate)) {
    throw new ConvexError("Joining date must be a real date (YYYY-MM-DD)");
  }
  return {
    monthlySalary: normalizeSalary(monthlySalary),
    joiningDate,
  };
}

function normalizeSalary(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_MONTHLY_SALARY) {
    throw new ConvexError("Monthly salary must be between 0 and 1,00,00,000");
  }
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-6) {
    throw new ConvexError("Monthly salary can have at most two decimal places");
  }
  return cents / 100;
}

async function listStaff(ctx: QueryCtx | MutationCtx) {
  const teachers = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "teacher"))
    .take(200);
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "super_admin"))
    .take(50);
  return [...teachers, ...admins].sort((a, b) =>
    displayName(a).localeCompare(displayName(b)),
  );
}

export const list = query({
  args: {},
  returns: v.array(staffRowValidator),
  handler: async (ctx) => {
    await requireSchoolViewer(ctx);
    const staff = await listStaff(ctx);
    return staff.map((user) => {
      const email = user.email?.trim();
      const phone = user.phone?.trim();
      return {
        userId: user._id,
        name: displayName(user),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        roleLabel: roleLabel(user),
        status: user.status,
        ...(user.monthlySalary !== undefined
          ? { monthlySalary: user.monthlySalary }
          : {}),
        ...(user.joiningDate ? { joiningDate: user.joiningDate } : {}),
      };
    });
  },
});

export const setEmployment = mutation({
  args: {
    userId: v.id("users"),
    monthlySalary: v.number(),
    joiningDate: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const target = await ctx.db.get("users", args.userId);
    if (!target || (target.role !== "teacher" && target.role !== "super_admin")) {
      throw new ConvexError("Staff member not found");
    }
    const employment = parseEmployment(args.monthlySalary, args.joiningDate);
    await ctx.db.patch("users", args.userId, employment);
    return null;
  },
});

const paymentModeValidator = v.union(v.literal("cash"), v.literal("online"));

const profileValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  role: v.union(v.literal("teacher"), v.literal("super_admin")),
  staffRole: v.optional(staffRoleValidator),
  roleLabel: v.string(),
  status: userStatusValidator,
  classId: v.optional(v.id("classes")),
  classIds: v.optional(v.array(v.id("classes"))),
  classLabels: v.array(v.string()),
  joiningDate: v.optional(v.string()),
  monthlySalary: v.optional(v.number()),
});

function isSalaryMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}

async function classLabel(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
) {
  const classroom = await ctx.db.get("classes", classId);
  return classroom ? `${classroom.name} ${classroom.section}`.trim() : null;
}

async function labelsFor(ctx: QueryCtx | MutationCtx, user: Doc<"users">) {
  if (user.staffRole === "class_teacher" && user.classId) {
    const label = await classLabel(ctx, user.classId);
    return label ? [label] : [];
  }
  if (user.staffRole === "incharge") {
    const labels: string[] = [];
    for (const classId of user.classIds ?? []) {
      const label = await classLabel(ctx, classId);
      if (label) {
        labels.push(label);
      }
    }
    return labels;
  }
  return [];
}

async function assertStaff(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  if (!user || (user.role !== "teacher" && user.role !== "super_admin")) {
    throw new ConvexError("Staff member not found");
  }
  return user;
}

function assignment(
  user: Doc<"users">,
  staffRole: Doc<"users">["staffRole"],
  classId?: Id<"classes">,
  classIds?: Id<"classes">[],
) {
  const {
    _id,
    _creationTime,
    classId: _classId,
    classIds: _classIds,
    ...rest
  } = user;
  return {
    ...rest,
    staffRole,
    ...(classId ? { classId } : {}),
    ...(classIds && classIds.length > 0 ? { classIds } : {}),
  };
}

export const profile = query({
  args: { userId: v.id("users") },
  returns: profileValidator,
  handler: async (ctx, args) => {
    await requireSchoolViewer(ctx);
    const user = await assertStaff(ctx, args.userId);
    const email = user.email?.trim();
    const phone = user.phone?.trim();
    const role: "teacher" | "super_admin" =
      user.role === "super_admin" ? "super_admin" : "teacher";
    return {
      userId: user._id,
      name: displayName(user),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      role,
      ...(user.staffRole ? { staffRole: user.staffRole } : {}),
      roleLabel: roleLabel(user),
      status: user.status,
      ...(user.classId ? { classId: user.classId } : {}),
      ...(user.classIds && user.classIds.length > 0 ? { classIds: user.classIds } : {}),
      classLabels: await labelsFor(ctx, user),
      ...(user.joiningDate ? { joiningDate: user.joiningDate } : {}),
      ...(user.monthlySalary !== undefined
        ? { monthlySalary: user.monthlySalary }
        : {}),
    };
  },
});

export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    phone: v.string(),
    status: v.optional(userStatusValidator),
    staffRole: v.optional(staffRoleValidator),
    classId: v.optional(v.id("classes")),
    classIds: v.optional(v.array(v.id("classes"))),
    monthlySalary: v.optional(v.number()),
    joiningDate: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireSchoolAdmin(ctx);
    const target = await assertStaff(ctx, args.userId);
    const superAdmin = admin.role === "super_admin";
    const name = args.name.trim();
    if (!name) {
      throw new ConvexError("Name is required");
    }
    const phone = args.phone.replace(/\D/g, "");
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      throw new ConvexError("Enter a 10-digit mobile number");
    }
    if (phone && phone !== target.phone) {
      const taken = await ctx.db
        .query("users")
        .withIndex("phone", (q) => q.eq("phone", phone))
        .take(1);
      if (taken.some((user) => user._id !== target._id)) {
        throw new ConvexError("An account with this phone number already exists");
      }
    }
    const hasSalary = args.monthlySalary !== undefined;
    const hasDate = args.joiningDate !== undefined && args.joiningDate !== "";
    if (hasSalary !== hasDate) {
      throw new ConvexError(
        "Set both monthly salary and joining date, or leave both empty",
      );
    }
    const employment =
      hasSalary && args.joiningDate
        ? parseEmployment(args.monthlySalary as number, args.joiningDate)
        : undefined;
    if (superAdmin && args.status && admin._id === target._id && args.status !== "active") {
      throw new ConvexError("You cannot deactivate your own account");
    }
    await ctx.db.patch("users", target._id, {
      name,
      ...(phone ? { phone } : {}),
      ...(superAdmin && args.status ? { status: args.status } : {}),
      ...(employment ?? {}),
    });
    let current = await ctx.db.get("users", target._id);
    if (!current) {
      throw new ConvexError("Staff member not found");
    }
    if (!phone && current.phone) {
      const { _id, _creationTime, phone: _phone, phoneVerificationTime: _verified, ...rest } =
        current;
      await ctx.db.replace("users", current._id, rest);
      current = (await ctx.db.get("users", target._id)) ?? current;
    }
    if (!superAdmin || current.role !== "teacher" || !args.staffRole) {
      return null;
    }
    if (signsInAsStaff(current.staffRole) !== signsInAsStaff(args.staffRole)) {
      throw new ConvexError(
        "A sign-in role cannot be changed into a non-login role, or the reverse",
      );
    }
    if (args.staffRole === "class_teacher") {
      if (!args.classId) {
        throw new ConvexError("Select a class for the class teacher");
      }
      const classroom = await ctx.db.get("classes", args.classId);
      if (!classroom) {
        throw new ConvexError("Class not found");
      }
      const holders = await ctx.db
        .query("users")
        .withIndex("by_class", (q) => q.eq("classId", args.classId))
        .take(10);
      if (
        holders.some(
          (user) => user._id !== current?._id && user.staffRole === "class_teacher",
        )
      ) {
        throw new ConvexError("That class already has a class teacher");
      }
      await ctx.db.replace(
        "users",
        current._id,
        assignment(current, "class_teacher", args.classId),
      );
      return null;
    }
    if (args.staffRole === "incharge") {
      const classIds = [...new Set(args.classIds ?? [])];
      if (classIds.length === 0) {
        throw new ConvexError("Select at least one class for the incharge");
      }
      if (classIds.length > 40) {
        throw new ConvexError("Select 40 classes or fewer");
      }
      for (const classId of classIds) {
        const classroom = await ctx.db.get("classes", classId);
        if (!classroom) {
          throw new ConvexError("Class not found");
        }
      }
      await ctx.db.replace(
        "users",
        current._id,
        assignment(current, "incharge", undefined, classIds),
      );
      return null;
    }
    await ctx.db.replace("users", current._id, assignment(current, args.staffRole));
    return null;
  },
});

function salaryMonths(joiningDate: string, asOf: string) {
  if (!isIsoDate(joiningDate) || !isIsoDate(asOf)) {
    return 0;
  }
  const start = joiningDate.slice(0, 7);
  const end = asOf.slice(0, 7);
  if (start > end) {
    return 0;
  }
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
}

const monthPaymentValidator = v.object({
  id: v.id("staffPayments"),
  amount: v.number(),
  paidOn: v.string(),
  mode: paymentModeValidator,
  note: v.optional(v.string()),
});

const monthRowValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
  roleLabel: v.string(),
  monthlySalary: v.optional(v.number()),
  joiningDate: v.optional(v.string()),
  paid: v.number(),
  due: v.optional(v.number()),
  payments: v.array(monthPaymentValidator),
});

export const ledger = query({
  args: { asOf: v.string() },
  returns: v.array(monthRowValidator),
  handler: async (ctx, args) => {
    await requireSchoolViewer(ctx);
    if (!isIsoDate(args.asOf)) {
      throw new ConvexError("Date must be YYYY-MM-DD");
    }
    const staff = await listStaff(ctx);
    return await Promise.all(
      staff.map(async (user) => {
        const payments = await ctx.db
          .query("staffPayments")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .take(200);
        payments.sort(
          (a, b) => b.paidOn.localeCompare(a.paidOn) || b._creationTime - a._creationTime,
        );
        const paid =
          Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100;
        const months = user.joiningDate ? salaryMonths(user.joiningDate, args.asOf) : 0;
        const due =
          user.monthlySalary !== undefined && user.joiningDate
            ? Math.max(0, Math.round((user.monthlySalary * months - paid) * 100) / 100)
            : undefined;
        return {
          userId: user._id,
          name: displayName(user),
          roleLabel: roleLabel(user),
          ...(user.monthlySalary !== undefined
            ? { monthlySalary: user.monthlySalary }
            : {}),
          ...(user.joiningDate ? { joiningDate: user.joiningDate } : {}),
          paid,
          ...(due !== undefined ? { due } : {}),
          payments: payments.map((payment) => ({
            id: payment._id,
            amount: payment.amount,
            paidOn: payment.paidOn,
            mode: payment.mode,
            ...(payment.note ? { note: payment.note } : {}),
          })),
        };
      }),
    );
  },
});

export const recordPayment = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    paidOn: v.string(),
    month: v.string(),
    mode: paymentModeValidator,
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireSchoolAdmin(ctx);
    await assertStaff(ctx, args.userId);
    if (!isIsoDate(args.paidOn)) {
      throw new ConvexError("Payment date must be YYYY-MM-DD");
    }
    if (!isSalaryMonth(args.month)) {
      throw new ConvexError("Salary month must be YYYY-MM");
    }
    if (!Number.isFinite(args.amount) || args.amount <= 0 || args.amount > MAX_MONTHLY_SALARY) {
      throw new ConvexError("Payment amount must be greater than 0 and at most 1,00,00,000");
    }
    const cents = Math.round(args.amount * 100);
    if (Math.abs(args.amount * 100 - cents) > 1e-6) {
      throw new ConvexError("Payment amount can have at most two decimal places");
    }
    const note = args.note?.trim();
    if (note && note.length > 200) {
      throw new ConvexError("Note must be 200 characters or fewer");
    }
    const existing = await ctx.db
      .query("staffPayments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .take(200);
    if (existing.length >= 200) {
      throw new ConvexError("This staff member already has 200 salary payments");
    }
    await ctx.db.insert("staffPayments", {
      userId: args.userId,
      amount: cents / 100,
      paidOn: args.paidOn,
      month: args.month,
      mode: args.mode,
      ...(note ? { note } : {}),
      recordedBy: admin._id,
    });
    return null;
  },
});
