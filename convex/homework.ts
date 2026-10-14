import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { isIsoDate, requireRoles, requireSuperAdmin } from "./lib/auth";

const homeworkRowValidator = v.object({
  classId: v.id("classes"),
  classLabel: v.string(),
  subjectId: v.id("subjects"),
  subjectName: v.string(),
  periodNumber: v.number(),
  teacherName: v.string(),
  message: v.string(),
});

type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

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

async function rowsForSlots(
  ctx: QueryCtx,
  slots: Doc<"timetables">[],
  date: string,
) {
  const earliestPeriod = new Map<string, number>();
  for (const slot of slots) {
    const key = `${slot.classId}:${slot.subjectId}`;
    const current = earliestPeriod.get(key);
    if (current === undefined || slot.periodNumber < current) {
      earliestPeriod.set(key, slot.periodNumber);
    }
  }

  const homeworkByClass = new Map<string, Doc<"homework">[]>();
  const classIds = [...new Set(slots.map((slot) => slot.classId))];
  for (const classId of classIds) {
    const saved = await ctx.db
      .query("homework")
      .withIndex("by_class_and_date", (q) =>
        q.eq("classId", classId).eq("date", date),
      )
      .take(40);
    homeworkByClass.set(classId, saved);
  }

  const rows = [];
  for (const slot of slots) {
    const classroom = await ctx.db.get("classes", slot.classId);
    const subject = await ctx.db.get("subjects", slot.subjectId);
    const teacher = slot.teacherId
      ? await ctx.db.get("users", slot.teacherId)
      : null;
    if (!classroom || !subject) {
      continue;
    }
    const saved = homeworkByClass.get(slot.classId) ?? [];
    const exact = saved.find(
      (row) =>
        row.subjectId === slot.subjectId &&
        row.periodNumber === slot.periodNumber,
    );
    const legacy =
      earliestPeriod.get(`${slot.classId}:${slot.subjectId}`) ===
      slot.periodNumber
        ? saved.find(
            (row) =>
              row.subjectId === slot.subjectId &&
              row.periodNumber === undefined,
          )
        : undefined;
    rows.push({
      classId: slot.classId,
      classLabel: `${classroom.name} ${classroom.section}`.trim(),
      subjectId: slot.subjectId,
      subjectName: subject.name,
      periodNumber: slot.periodNumber,
      teacherName: teacher?.name ?? teacher?.email ?? "Unassigned",
      message: exact?.message ?? legacy?.message ?? "",
    });
  }
  rows.sort(
    (a, b) =>
      a.classLabel.localeCompare(b.classLabel) ||
      a.periodNumber - b.periodNumber ||
      a.subjectName.localeCompare(b.subjectName),
  );
  return rows;
}

export const mineForDate = query({
  args: { date: v.string() },
  returns: v.array(homeworkRowValidator),
  handler: async (ctx, args) => {
    const user = await requireRoles(ctx, ["teacher"]);
    const day = weekdayFromIso(args.date);
    if (!day) {
      return [];
    }
    const slots = (
      await ctx.db
        .query("timetables")
        .withIndex("by_teacher", (q) => q.eq("teacherId", user._id))
        .take(200)
    ).filter((slot) => slot.dayOfWeek === day);
    return await rowsForSlots(ctx, slots, args.date);
  },
});

export const forClassDate = query({
  args: {
    classId: v.id("classes"),
    date: v.string(),
  },
  returns: v.array(homeworkRowValidator),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const day = weekdayFromIso(args.date);
    if (!day) {
      return [];
    }
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const slots = (
      await ctx.db
        .query("timetables")
        .withIndex("by_class", (q) => q.eq("classId", args.classId))
        .take(80)
    ).filter((slot) => slot.dayOfWeek === day);
    return await rowsForSlots(ctx, slots, args.date);
  },
});

export const save = mutation({
  args: {
    classId: v.id("classes"),
    subjectId: v.id("subjects"),
    periodNumber: v.number(),
    date: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRoles(ctx, ["teacher"]);
    const day = weekdayFromIso(args.date);
    if (!day) {
      throw new ConvexError("There is no timetable on Sunday");
    }
    if (args.message.length > 1000) {
      throw new ConvexError("Homework must be 1000 characters or less");
    }
    if (
      !Number.isInteger(args.periodNumber) ||
      args.periodNumber < 1 ||
      args.periodNumber > 8
    ) {
      throw new ConvexError("Period number must be between 1 and 8");
    }
    await assertCanEnter(
      ctx,
      user,
      args.classId,
      args.subjectId,
      args.periodNumber,
      day,
    );
    const message = args.message.trim();
    const daySlots = (
      await ctx.db
        .query("timetables")
        .withIndex("by_class", (q) => q.eq("classId", args.classId))
        .take(80)
    ).filter(
      (slot) => slot.dayOfWeek === day && slot.subjectId === args.subjectId,
    );
    const earliestPeriod = Math.min(
      ...daySlots.map((slot) => slot.periodNumber),
    );
    const saved = await ctx.db
      .query("homework")
      .withIndex("by_class_subject_and_date", (q) =>
        q
          .eq("classId", args.classId)
          .eq("subjectId", args.subjectId)
          .eq("date", args.date),
      )
      .take(8);
    const existing =
      saved.find((row) => row.periodNumber === args.periodNumber) ??
      (args.periodNumber === earliestPeriod
        ? saved.find((row) => row.periodNumber === undefined)
        : undefined);
    if (!message) {
      if (existing) {
        await ctx.db.delete("homework", existing._id);
      }
      return null;
    }
    if (existing) {
      await ctx.db.patch("homework", existing._id, {
        message,
        periodNumber: args.periodNumber,
        enteredBy: user._id,
      });
      return null;
    }
    await ctx.db.insert("homework", {
      classId: args.classId,
      subjectId: args.subjectId,
      periodNumber: args.periodNumber,
      date: args.date,
      message,
      enteredBy: user._id,
    });
    return null;
  },
});

async function assertCanEnter(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  classId: Id<"classes">,
  subjectId: Id<"subjects">,
  periodNumber: number,
  day: Weekday,
) {
  const slots = (
    await ctx.db
      .query("timetables")
      .withIndex("by_class", (q) => q.eq("classId", classId))
      .take(80)
  ).filter(
    (slot) =>
      slot.dayOfWeek === day &&
      slot.subjectId === subjectId &&
      slot.periodNumber === periodNumber,
  );
  if (slots.length === 0) {
    throw new ConvexError("That subject is not on the timetable for this period");
  }
  const teaches = slots.some((slot) => slot.teacherId === user._id);
  if (!teaches) {
    throw new ConvexError(
      "Only the main teacher can enter homework for this period",
    );
  }
}
