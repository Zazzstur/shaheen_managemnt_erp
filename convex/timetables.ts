import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRoles, requireSuperAdmin } from "./lib/auth";
import { dayOfWeekValidator, userDocValidator } from "./lib/validators";

const slotValidator = v.object({
  _id: v.id("timetables"),
  _creationTime: v.number(),
  classId: v.id("classes"),
  dayOfWeek: dayOfWeekValidator,
  periodNumber: v.number(),
  subjectId: v.id("subjects"),
  teacherId: v.optional(v.id("users")),
  subjectName: v.string(),
  teacherName: v.string(),
});

export const listTeachers = query({
  args: {},
  returns: v.array(userDocValidator),
  handler: async (ctx) => {
    await requireRoles(ctx, ["super_admin", "teacher"]);
    const teachers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "teacher"))
      .take(200);
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "super_admin"))
      .take(50);
    return [...teachers, ...admins];
  },
});

export const listForClass = query({
  args: { classId: v.id("classes") },
  returns: v.array(slotValidator),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin", "teacher", "student", "parent"]);
    const slots = await ctx.db
      .query("timetables")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);
    const result = [];
    for (const slot of slots) {
      const subject = await ctx.db.get("subjects", slot.subjectId);
      const teacher = slot.teacherId
        ? await ctx.db.get("users", slot.teacherId)
        : null;
      result.push({
        ...slot,
        subjectName: subject?.name ?? "Unknown subject",
        teacherName: teacher?.name ?? teacher?.email ?? "Unassigned",
      });
    }
    return result;
  },
});

const teacherSlotValidator = v.object({
  _id: v.id("timetables"),
  dayOfWeek: dayOfWeekValidator,
  periodNumber: v.number(),
  classLabel: v.string(),
  subjectName: v.string(),
});

export const listMine = query({
  args: {},
  returns: v.array(teacherSlotValidator),
  handler: async (ctx) => {
    const user = await requireRoles(ctx, ["teacher"]);
    const slots = await ctx.db
      .query("timetables")
      .withIndex("by_teacher", (q) => q.eq("teacherId", user._id))
      .take(80);
    const result = [];
    for (const slot of slots) {
      const classroom = await ctx.db.get("classes", slot.classId);
      const subject = await ctx.db.get("subjects", slot.subjectId);
      result.push({
        _id: slot._id,
        dayOfWeek: slot.dayOfWeek,
        periodNumber: slot.periodNumber,
        classLabel: classroom
          ? `${classroom.name} ${classroom.section}`.trim()
          : "Unassigned class",
        subjectName: subject?.name ?? "Unknown subject",
      });
    }
    return result;
  },
});

export const upsertSlot = mutation({
  args: {
    classId: v.id("classes"),
    dayOfWeek: dayOfWeekValidator,
    periodNumber: v.number(),
    subjectId: v.id("subjects"),
    teacherId: v.optional(v.id("users")),
  },
  returns: v.id("timetables"),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    if (!Number.isInteger(args.periodNumber) || args.periodNumber < 1 || args.periodNumber > 8) {
      throw new Error("Period number must be between 1 and 8");
    }
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const subject = await ctx.db.get("subjects", args.subjectId);
    if (!subject) {
      throw new Error("Subject not found");
    }
    if (args.teacherId) {
      const teacher = await ctx.db.get("users", args.teacherId);
      if (
        !teacher ||
        (teacher.role !== "teacher" && teacher.role !== "super_admin")
      ) {
        throw new Error("Teacher not found");
      }
    }
    const existing = await ctx.db
      .query("timetables")
      .withIndex("by_class_day_period", (q) =>
        q
          .eq("classId", args.classId)
          .eq("dayOfWeek", args.dayOfWeek)
          .eq("periodNumber", args.periodNumber),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("timetables", existing._id, {
        subjectId: args.subjectId,
        teacherId: args.teacherId ?? existing.teacherId,
      });
      return existing._id;
    }
    return await ctx.db.insert("timetables", args);
  },
});
