import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { getCurrentUser, isIsoDate, isSchoolAdmin } from "./lib/auth";
import { assistantIdsOf } from "./lib/timetableAssistants";
import { dayOfWeekValidator } from "./lib/validators";

type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

const teacherChoiceValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  email: v.optional(v.string()),
  absent: v.boolean(),
});

const coverOptionValidator = v.object({
  teacherId: v.id("users"),
  label: v.string(),
  group: v.union(v.literal("free"), v.literal("assistant")),
});

const freePeriodValidator = v.object({
  timetableId: v.id("timetables"),
  classLabel: v.string(),
  periodNumber: v.number(),
  subjectName: v.string(),
  absentTeacherName: v.string(),
  coverTeacherId: v.optional(v.id("users")),
  options: v.array(coverOptionValidator),
});

function weekdayFromIso(date: string): Weekday | null {
  if (!isIsoDate(date)) {
    throw new ConvexError("Date must be YYYY-MM-DD");
  }
  const [year, month, day] = date.split("-").map((part) => Number(part));
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const names = [
    null,
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;
  return names[weekday] ?? null;
}

function displayName(user: { name?: string; email?: string }) {
  const name = user.name?.trim();
  if (name) {
    return name;
  }
  return user.email?.trim() || "Unnamed teacher";
}

function isStaffTeacher(user: Doc<"users"> | null): user is Doc<"users"> {
  return (
    user !== null && (user.role === "teacher" || user.role === "super_admin")
  );
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

async function slotsOnDay(ctx: QueryCtx | MutationCtx, day: Weekday) {
  return await ctx.db
    .query("timetables")
    .withIndex("by_day", (q) => q.eq("dayOfWeek", day))
    .take(800);
}

async function absencesOnDate(ctx: QueryCtx | MutationCtx, date: string) {
  return await ctx.db
    .query("teacherAbsences")
    .withIndex("by_date", (q) => q.eq("date", date))
    .take(300);
}

async function requireStaffTeacher(
  ctx: QueryCtx | MutationCtx,
  teacherId: Id<"users">,
) {
  const teacher = await ctx.db.get("users", teacherId);
  if (!isStaffTeacher(teacher)) {
    throw new ConvexError("Teacher not found");
  }
  return teacher;
}

async function classLabel(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
  cache: Map<string, string>,
) {
  const cached = cache.get(classId);
  if (cached) {
    return cached;
  }
  const classroom = await ctx.db.get("classes", classId);
  const label = classroom
    ? `${classroom.name} ${classroom.section}`.trim()
    : "Unknown class";
  cache.set(classId, label);
  return label;
}

export const forDate = query({
  args: { date: v.string() },
  returns: v.object({
    weekday: v.union(dayOfWeekValidator, v.null()),
    teachers: v.array(teacherChoiceValidator),
    periods: v.array(freePeriodValidator),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const incharge = user.staffRole === "incharge";
    if (!isSchoolAdmin(user) && !incharge) {
      throw new Error("Unauthorized: insufficient role");
    }
    const assignedClasses = new Set(user.classIds ?? []);
    const weekday = weekdayFromIso(args.date);
    const staff = await listStaff(ctx);
    const absences = await absencesOnDate(ctx, args.date);
    const absentIds = new Set(absences.map((absence) => absence.teacherId));
    const teachers = staff.map((teacher) => {
      const email = teacher.email?.trim();
      return {
        _id: teacher._id,
        name: displayName(teacher),
        ...(email ? { email } : {}),
        absent: absentIds.has(teacher._id),
      };
    });
    if (!weekday || absentIds.size === 0) {
      return { weekday, teachers, periods: [] };
    }

    const slots = await slotsOnDay(ctx, weekday);
    const labels = new Map<string, string>();
    const mainsByPeriod = new Map<number, Set<Id<"users">>>();
    const assistantsByPeriod = new Map<number, Map<Id<"users">, string[]>>();

    for (const slot of slots) {
      if (slot.teacherId) {
        const mains = mainsByPeriod.get(slot.periodNumber) ?? new Set();
        mains.add(slot.teacherId);
        mainsByPeriod.set(slot.periodNumber, mains);
      }
      const assistantIds = assistantIdsOf(slot);
      if (assistantIds.length > 0) {
        const byTeacher =
          assistantsByPeriod.get(slot.periodNumber) ??
          new Map<Id<"users">, string[]>();
        const label = await classLabel(ctx, slot.classId, labels);
        for (const assistantId of assistantIds) {
          const current = byTeacher.get(assistantId) ?? [];
          if (!current.includes(label)) {
            current.push(label);
          }
          byTeacher.set(assistantId, current);
        }
        assistantsByPeriod.set(slot.periodNumber, byTeacher);
      }
    }

    const covers = await ctx.db
      .query("freeClassCovers")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .take(500);
    const coverBySlot = new Map(
      covers.map((cover) => [cover.timetableId, cover.coverTeacherId]),
    );

    const periods = [];
    for (const slot of slots) {
      if (!slot.teacherId || !absentIds.has(slot.teacherId)) {
        continue;
      }
      if (incharge && !assignedClasses.has(slot.classId)) {
        continue;
      }
      const mains = mainsByPeriod.get(slot.periodNumber) ?? new Set();
      const assistants =
        assistantsByPeriod.get(slot.periodNumber) ??
        new Map<Id<"users">, string[]>();
      const options = staff
        .filter(
          (teacher) => !absentIds.has(teacher._id) && !mains.has(teacher._id),
        )
        .map((teacher) => {
          const assisting = assistants.get(teacher._id) ?? [];
          const name = displayName(teacher);
          const isAssistant = assisting.length > 0;
          return {
            teacherId: teacher._id,
            group: isAssistant ? ("assistant" as const) : ("free" as const),
            label: isAssistant
              ? `${name} (assisting ${assisting.join(", ")})`
              : name,
          };
        })
        .sort(
          (a, b) =>
            (a.group === b.group ? 0 : a.group === "free" ? -1 : 1) ||
            a.label.localeCompare(b.label),
        );
      const optionIds = new Set(options.map((option) => option.teacherId));
      const storedCover = coverBySlot.get(slot._id);
      const subject = await ctx.db.get("subjects", slot.subjectId);
      const absentTeacher = await ctx.db.get("users", slot.teacherId);
      periods.push({
        timetableId: slot._id,
        classLabel: await classLabel(ctx, slot.classId, labels),
        periodNumber: slot.periodNumber,
        subjectName: subject?.name ?? "Unknown subject",
        absentTeacherName: absentTeacher
          ? displayName(absentTeacher)
          : "Unknown teacher",
        ...(storedCover && optionIds.has(storedCover)
          ? { coverTeacherId: storedCover }
          : {}),
        options,
      });
    }
    periods.sort(
      (a, b) =>
        a.periodNumber - b.periodNumber ||
        a.classLabel.localeCompare(b.classLabel),
    );
    return { weekday, teachers, periods };
  },
});

export const setAbsence = mutation({
  args: {
    date: v.string(),
    teacherId: v.id("users"),
    absent: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!isSchoolAdmin(user)) {
      throw new Error("Unauthorized: insufficient role");
    }
    if (!isIsoDate(args.date)) {
      throw new ConvexError("Date must be YYYY-MM-DD");
    }
    await requireStaffTeacher(ctx, args.teacherId);
    const existing = await ctx.db
      .query("teacherAbsences")
      .withIndex("by_date_and_teacher", (q) =>
        q.eq("date", args.date).eq("teacherId", args.teacherId),
      )
      .take(5);
    if (args.absent) {
      if (existing.length === 0) {
        await ctx.db.insert("teacherAbsences", {
          date: args.date,
          teacherId: args.teacherId,
        });
      }
      const covers = await ctx.db
        .query("freeClassCovers")
        .withIndex("by_date", (q) => q.eq("date", args.date))
        .take(500);
      for (const cover of covers) {
        if (cover.coverTeacherId === args.teacherId) {
          await ctx.db.delete("freeClassCovers", cover._id);
        }
      }
    } else {
      for (const absence of existing) {
        await ctx.db.delete("teacherAbsences", absence._id);
      }
    }
    return null;
  },
});

export const setCover = mutation({
  args: {
    date: v.string(),
    timetableId: v.id("timetables"),
    coverTeacherId: v.optional(v.id("users")),
    clearCover: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const weekday = weekdayFromIso(args.date);
    if (!weekday) {
      throw new ConvexError("There is no timetable on Sunday");
    }
    const slot = await ctx.db.get("timetables", args.timetableId);
    if (!slot || slot.dayOfWeek !== weekday) {
      throw new ConvexError("That class period was not found on this day");
    }
    const allowed =
      isSchoolAdmin(user) ||
      (user.staffRole === "incharge" &&
        (user.classIds ?? []).includes(slot.classId));
    if (!allowed) {
      throw new ConvexError("You can only assign a cover for your classes");
    }
    if (!slot.teacherId) {
      throw new ConvexError("That period has no main teacher");
    }
    const absence = await ctx.db
      .query("teacherAbsences")
      .withIndex("by_date_and_teacher", (q) =>
        q.eq("date", args.date).eq("teacherId", slot.teacherId!),
      )
      .unique();
    if (!absence) {
      throw new ConvexError(
        "That period is not free. The main teacher is not absent.",
      );
    }

    const existing = await ctx.db
      .query("freeClassCovers")
      .withIndex("by_date_and_slot", (q) =>
        q.eq("date", args.date).eq("timetableId", args.timetableId),
      )
      .take(5);

    if (args.clearCover) {
      for (const cover of existing) {
        await ctx.db.delete("freeClassCovers", cover._id);
      }
      return null;
    }

    const coverTeacherId = args.coverTeacherId;
    if (!coverTeacherId) {
      throw new ConvexError("Choose a cover teacher");
    }
    await requireStaffTeacher(ctx, coverTeacherId);
    const coverAbsence = await ctx.db
      .query("teacherAbsences")
      .withIndex("by_date_and_teacher", (q) =>
        q.eq("date", args.date).eq("teacherId", coverTeacherId),
      )
      .unique();
    if (coverAbsence) {
      throw new ConvexError("That teacher is absent");
    }
    const daySlots = await slotsOnDay(ctx, weekday);
    const teachingThisPeriod = daySlots.some(
      (daySlot) =>
        daySlot.periodNumber === slot.periodNumber &&
        daySlot.teacherId === coverTeacherId,
    );
    if (teachingThisPeriod) {
      throw new ConvexError("That teacher already has a class this period");
    }

    const [current, ...duplicates] = existing;
    for (const duplicate of duplicates) {
      await ctx.db.delete("freeClassCovers", duplicate._id);
    }
    if (current) {
      await ctx.db.patch("freeClassCovers", current._id, { coverTeacherId });
    } else {
      await ctx.db.insert("freeClassCovers", {
        date: args.date,
        timetableId: args.timetableId,
        coverTeacherId,
      });
    }
    return null;
  },
});
