import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRoles, requireSuperAdmin } from "./lib/auth";
import {
  classAdminRowValidator,
  extraFeeValidator,
  tuitionCycleValidator,
} from "./lib/validators";

function normalizeExtraFees(
  extraFees: Array<{ label: string; amount: number }>,
) {
  if (extraFees.length > 20) {
    throw new Error("A class can have at most 20 extra fee components");
  }
  return extraFees.map((fee) => {
    const label = fee.label.trim();
    if (!label) {
      throw new Error("Each extra fee needs a label");
    }
    if (!Number.isFinite(fee.amount) || fee.amount <= 0) {
      throw new Error("Fee amounts must be greater than 0");
    }
    return { label, amount: fee.amount };
  });
}

function totalClassFee(
  baseTuitionFee: number,
  extraFees: Array<{ amount: number }>,
) {
  return (
    baseTuitionFee + extraFees.reduce((sum, fee) => sum + fee.amount, 0)
  );
}

export const listWithStats = query({
  args: {},
  returns: v.array(classAdminRowValidator),
  handler: async (ctx) => {
    await requireRoles(ctx, ["super_admin"]);
    const classes = await ctx.db.query("classes").take(100);
    const rows = [];
    for (const classroom of classes) {
      const students = await ctx.db
        .query("students")
        .withIndex("by_class", (q) => q.eq("classId", classroom._id))
        .take(80);
      const extraFees = classroom.extraFees ?? [];
      const baseTuitionFee = classroom.baseTuitionFee ?? 0;
      rows.push({
        _id: classroom._id,
        _creationTime: classroom._creationTime,
        name: classroom.name,
        section: classroom.section,
        academicYear: classroom.academicYear,
        tuitionCycle: classroom.tuitionCycle ?? "monthly",
        baseTuitionFee,
        extraFees,
        enrolledCount: students.filter((student) => student.status === "enrolled")
          .length,
        totalClassFee: totalClassFee(baseTuitionFee, extraFees),
      });
    }
    return rows;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    section: v.optional(v.string()),
    academicYear: v.string(),
    tuitionCycle: tuitionCycleValidator,
    baseTuitionFee: v.number(),
    extraFees: v.array(extraFeeValidator),
  },
  returns: v.id("classes"),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const name = args.name.trim();
    const academicYear = args.academicYear.trim();
    if (!name || !academicYear) {
      throw new Error("Class name and academic year are required");
    }
    if (!Number.isFinite(args.baseTuitionFee) || args.baseTuitionFee <= 0) {
      throw new Error("Base tuition fee must be greater than 0");
    }
    const extraFees = normalizeExtraFees(args.extraFees);
    return await ctx.db.insert("classes", {
      name,
      section: args.section?.trim() ?? "",
      academicYear,
      tuitionCycle: args.tuitionCycle,
      baseTuitionFee: args.baseTuitionFee,
      extraFees,
    });
  },
});

export const update = mutation({
  args: {
    classId: v.id("classes"),
    name: v.string(),
    section: v.optional(v.string()),
    academicYear: v.string(),
    tuitionCycle: tuitionCycleValidator,
    baseTuitionFee: v.number(),
    extraFees: v.array(extraFeeValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const name = args.name.trim();
    const academicYear = args.academicYear.trim();
    if (!name || !academicYear) {
      throw new Error("Class name and academic year are required");
    }
    if (!Number.isFinite(args.baseTuitionFee) || args.baseTuitionFee <= 0) {
      throw new Error("Base tuition fee must be greater than 0");
    }
    await ctx.db.patch("classes", args.classId, {
      name,
      section: args.section?.trim() ?? "",
      academicYear,
      tuitionCycle: args.tuitionCycle,
      baseTuitionFee: args.baseTuitionFee,
      extraFees: normalizeExtraFees(args.extraFees),
    });
    return null;
  },
});

export const remove = mutation({
  args: { classId: v.id("classes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const enrolled = await ctx.db
      .query("students")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(1);
    if (enrolled.length > 0) {
      throw new Error("Cannot delete a class that still has students");
    }
    const slots = await ctx.db
      .query("timetables")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);
    for (const slot of slots) {
      await ctx.db.delete("timetables", slot._id);
    }
    await ctx.db.delete("classes", args.classId);
    return null;
  },
});
