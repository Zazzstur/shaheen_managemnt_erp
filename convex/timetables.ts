import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { requireRoles, requireSchoolAdmin } from "./lib/auth";
import { dayOfWeekValidator, userDocValidator } from "./lib/validators";

const slotValidator = v.object({
  _id: v.id("timetables"),
  _creationTime: v.number(),
  classId: v.id("classes"),
  dayOfWeek: dayOfWeekValidator,
  periodNumber: v.number(),
  subjectId: v.id("subjects"),
  teacherId: v.optional(v.id("users")),
  assistantTeacherId: v.optional(v.id("users")),
  subjectName: v.string(),
  teacherName: v.string(),
  assistantTeacherName: v.optional(v.string()),
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
      const assistant = slot.assistantTeacherId
        ? await ctx.db.get("users", slot.assistantTeacherId)
        : null;
      result.push({
        _id: slot._id,
        _creationTime: slot._creationTime,
        classId: slot.classId,
        dayOfWeek: slot.dayOfWeek,
        periodNumber: slot.periodNumber,
        subjectId: slot.subjectId,
        ...(slot.teacherId ? { teacherId: slot.teacherId } : {}),
        ...(slot.assistantTeacherId
          ? { assistantTeacherId: slot.assistantTeacherId }
          : {}),
        subjectName: subject?.name ?? "Unknown subject",
        teacherName: teacher?.name ?? teacher?.email ?? "Unassigned",
        ...(assistant
          ? { assistantTeacherName: assistant.name ?? assistant.email }
          : {}),
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

const teachingAssignmentValidator = v.object({
  classId: v.id("classes"),
  classLabel: v.string(),
  subjectId: v.id("subjects"),
  subjectName: v.string(),
});

export const myTeachingAssignments = query({
  args: {},
  returns: v.array(teachingAssignmentValidator),
  handler: async (ctx) => {
    const user = await requireRoles(ctx, ["teacher"]);
    const slots = await ctx.db
      .query("timetables")
      .withIndex("by_teacher", (q) => q.eq("teacherId", user._id))
      .take(200);
    const seen = new Set<string>();
    const result = [];
    for (const slot of slots) {
      const key = `${slot.classId}:${slot.subjectId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const classroom = await ctx.db.get("classes", slot.classId);
      const subject = await ctx.db.get("subjects", slot.subjectId);
      if (!classroom || !subject) {
        continue;
      }
      result.push({
        classId: slot.classId,
        classLabel: `${classroom.name} ${classroom.section}`.trim(),
        subjectId: slot.subjectId,
        subjectName: subject.name,
      });
    }
    result.sort(
      (a, b) =>
        a.classLabel.localeCompare(b.classLabel) ||
        a.subjectName.localeCompare(b.subjectName),
    );
    return result;
  },
});

export const listMine = query({
  args: {},
  returns: v.array(teacherSlotValidator),
  handler: async (ctx) => {
    const user = await requireRoles(ctx, ["teacher"]);
    const slots = await slotsTaughtBy(ctx, user._id);
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
    assistantTeacherId: v.optional(v.id("users")),
    clearAssistantTeacher: v.optional(v.boolean()),
  },
  returns: v.id("timetables"),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
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
      await assertStaffTeacher(ctx, args.teacherId);
    }
    if (args.assistantTeacherId) {
      await assertStaffTeacher(ctx, args.assistantTeacherId);
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
    const teacherId = args.teacherId ?? existing?.teacherId;
    if (
      args.assistantTeacherId &&
      teacherId &&
      args.assistantTeacherId === teacherId
    ) {
      throw new Error("Assistant teacher must be different from the main teacher");
    }
    if (existing) {
      await ctx.db.patch("timetables", existing._id, {
        subjectId: args.subjectId,
        ...(args.teacherId ? { teacherId: args.teacherId } : {}),
        ...(args.clearAssistantTeacher
          ? { assistantTeacherId: undefined }
          : args.assistantTeacherId
            ? { assistantTeacherId: args.assistantTeacherId }
            : {}),
      });
      return existing._id;
    }
    return await ctx.db.insert("timetables", {
      classId: args.classId,
      dayOfWeek: args.dayOfWeek,
      periodNumber: args.periodNumber,
      subjectId: args.subjectId,
      ...(args.teacherId ? { teacherId: args.teacherId } : {}),
      ...(args.assistantTeacherId
        ? { assistantTeacherId: args.assistantTeacherId }
        : {}),
    });
  },
});

async function assertStaffTeacher(
  ctx: QueryCtx | MutationCtx,
  teacherId: Id<"users">,
) {
  const teacher = await ctx.db.get("users", teacherId);
  if (
    !teacher ||
    (teacher.role !== "teacher" && teacher.role !== "super_admin")
  ) {
    throw new Error("Teacher not found");
  }
}

async function slotsTaughtBy(
  ctx: QueryCtx | MutationCtx,
  teacherId: Id<"users">,
) {
  const main = await ctx.db
    .query("timetables")
    .withIndex("by_teacher", (q) => q.eq("teacherId", teacherId))
    .take(200);
  const assisting = await ctx.db
    .query("timetables")
    .withIndex("by_assistant_teacher", (q) =>
      q.eq("assistantTeacherId", teacherId),
    )
    .take(200);
  const seen = new Set<string>();
  const slots = [];
  for (const slot of [...main, ...assisting]) {
    if (seen.has(slot._id)) {
      continue;
    }
    seen.add(slot._id);
    slots.push(slot);
  }
  return slots;
}
