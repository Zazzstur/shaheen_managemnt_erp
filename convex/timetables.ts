import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import {
  getCurrentUser,
  isIncharge,
  isSchoolAdmin,
  requireRoles,
  requireSchoolAdmin,
} from "./lib/auth";
import {
  assistantIdsOf,
  slotsTaughtBy,
} from "./lib/timetableAssistants";
import { dayOfWeekValidator, userDocValidator } from "./lib/validators";

const slotValidator = v.object({
  _id: v.id("timetables"),
  _creationTime: v.number(),
  classId: v.id("classes"),
  dayOfWeek: dayOfWeekValidator,
  periodNumber: v.number(),
  subjectId: v.id("subjects"),
  teacherId: v.optional(v.id("users")),
  assistantTeacherIds: v.array(v.id("users")),
  subjectName: v.string(),
  teacherName: v.string(),
  assistantTeacherNames: v.array(v.string()),
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
      const assistantTeacherIds = assistantIdsOf(slot);
      const assistantTeacherNames: string[] = [];
      for (const assistantId of assistantTeacherIds) {
        const assistant = await ctx.db.get("users", assistantId);
        assistantTeacherNames.push(
          assistant?.name ?? assistant?.email ?? "Unassigned",
        );
      }
      result.push({
        _id: slot._id,
        _creationTime: slot._creationTime,
        classId: slot.classId,
        dayOfWeek: slot.dayOfWeek,
        periodNumber: slot.periodNumber,
        subjectId: slot.subjectId,
        ...(slot.teacherId ? { teacherId: slot.teacherId } : {}),
        assistantTeacherIds,
        subjectName: subject?.name ?? "Unknown subject",
        teacherName: teacher?.name ?? teacher?.email ?? "Unassigned",
        assistantTeacherNames,
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

const timetableTeacherValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
});

const viewedTeacherSlotValidator = v.object({
  _id: v.id("timetables"),
  dayOfWeek: dayOfWeekValidator,
  periodNumber: v.number(),
  classLabel: v.string(),
  subjectName: v.string(),
  assignment: v.union(v.literal("main"), v.literal("assistant")),
});

async function requireTimetableViewer(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (!isSchoolAdmin(user) && !isIncharge(user)) {
    throw new Error("Unauthorized: insufficient role");
  }
  return user;
}

export const listTimetableTeachers = query({
  args: {},
  returns: v.array(timetableTeacherValidator),
  handler: async (ctx) => {
    await requireTimetableViewer(ctx);
    const teachers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "teacher"))
      .take(200);
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "super_admin"))
      .take(50);
    return [...teachers, ...admins]
      .map((teacher) => ({
        _id: teacher._id,
        name: teacher.name ?? teacher.email ?? "Unnamed",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listForTeacher = query({
  args: { teacherId: v.id("users") },
  returns: v.array(viewedTeacherSlotValidator),
  handler: async (ctx, args) => {
    await requireTimetableViewer(ctx);
    await assertStaffTeacher(ctx, args.teacherId);
    const slots = await slotsTaughtBy(ctx, args.teacherId);
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
        assignment:
          slot.teacherId === args.teacherId
            ? ("main" as const)
            : ("assistant" as const),
      });
    }
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

export const clearSlot = mutation({
  args: {
    classId: v.id("classes"),
    dayOfWeek: dayOfWeekValidator,
    periodNumber: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    assertPeriodNumber(args.periodNumber);
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
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
    if (!existing) {
      return null;
    }
    const covers = await ctx.db
      .query("freeClassCovers")
      .filter((q) => q.eq(q.field("timetableId"), existing._id))
      .take(50);
    for (const cover of covers) {
      await ctx.db.delete("freeClassCovers", cover._id);
    }
    await ctx.db.delete("timetables", existing._id);
    return null;
  },
});

export const upsertSlot = mutation({
  args: {
    classId: v.id("classes"),
    dayOfWeek: dayOfWeekValidator,
    periodNumber: v.number(),
    subjectId: v.id("subjects"),
    teacherId: v.optional(v.id("users")),
    assistantTeacherIds: v.optional(v.array(v.id("users"))),
  },
  returns: v.id("timetables"),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    assertPeriodNumber(args.periodNumber);
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
    const assistantTeacherIds = await normalizeAssistants(
      ctx,
      args.assistantTeacherIds ??
        (existing ? assistantIdsOf(existing) : []),
      teacherId,
    );
    const assistantFields =
      assistantTeacherIds.length > 0
        ? { assistantTeacherIds, assistantTeacherId: undefined }
        : { assistantTeacherIds: undefined, assistantTeacherId: undefined };
    if (existing) {
      await ctx.db.patch("timetables", existing._id, {
        subjectId: args.subjectId,
        ...(args.teacherId ? { teacherId: args.teacherId } : {}),
        ...assistantFields,
      });
      return existing._id;
    }
    return await ctx.db.insert("timetables", {
      classId: args.classId,
      dayOfWeek: args.dayOfWeek,
      periodNumber: args.periodNumber,
      subjectId: args.subjectId,
      ...(args.teacherId ? { teacherId: args.teacherId } : {}),
      ...(assistantTeacherIds.length > 0 ? { assistantTeacherIds } : {}),
    });
  },
});

function assertPeriodNumber(periodNumber: number) {
  if (!Number.isInteger(periodNumber) || periodNumber < 1 || periodNumber > 8) {
    throw new Error("Period number must be between 1 and 8");
  }
}

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

async function normalizeAssistants(
  ctx: QueryCtx | MutationCtx,
  assistantTeacherIds: Id<"users">[],
  teacherId: Id<"users"> | undefined,
) {
  if (assistantTeacherIds.length > 2) {
    throw new Error("A class period can have at most two assistant teachers");
  }
  const seen = new Set<Id<"users">>();
  for (const assistantId of assistantTeacherIds) {
    if (seen.has(assistantId)) {
      throw new Error("The same assistant teacher cannot be assigned twice");
    }
    seen.add(assistantId);
    if (teacherId && assistantId === teacherId) {
      throw new Error(
        "Assistant teacher must be different from the main teacher",
      );
    }
    await assertStaffTeacher(ctx, assistantId);
  }
  return assistantTeacherIds;
}
