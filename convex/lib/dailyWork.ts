import { ConvexError, v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { getCurrentUser, isIsoDate, isSchoolAdmin, requireRoles } from "./auth";
import { assistantIdsOf, slotsTaughtBy } from "./timetableAssistants";

export type WorkTable = "homework" | "classwork";

export const workRowValidator = v.object({
  classId: v.id("classes"),
  classLabel: v.string(),
  subjectId: v.id("subjects"),
  subjectName: v.string(),
  periodNumber: v.number(),
  teacherName: v.string(),
  message: v.string(),
});

type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

type SavedWork = {
  _id: Id<"homework"> | Id<"classwork">;
  subjectId: Id<"subjects">;
  periodNumber?: number;
  message: string;
};

function workLabel(table: WorkTable) {
  return table === "homework" ? "Homework" : "Classwork";
}

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

async function listByClassDate(
  ctx: QueryCtx | MutationCtx,
  table: WorkTable,
  classId: Id<"classes">,
  date: string,
): Promise<SavedWork[]> {
  if (table === "homework") {
    return await ctx.db
      .query("homework")
      .withIndex("by_class_and_date", (q) =>
        q.eq("classId", classId).eq("date", date),
      )
      .take(40);
  }
  return await ctx.db
    .query("classwork")
    .withIndex("by_class_and_date", (q) =>
      q.eq("classId", classId).eq("date", date),
    )
    .take(40);
}

async function listByClassSubjectDate(
  ctx: QueryCtx | MutationCtx,
  table: WorkTable,
  classId: Id<"classes">,
  subjectId: Id<"subjects">,
  date: string,
): Promise<SavedWork[]> {
  if (table === "homework") {
    return await ctx.db
      .query("homework")
      .withIndex("by_class_subject_and_date", (q) =>
        q.eq("classId", classId).eq("subjectId", subjectId).eq("date", date),
      )
      .take(8);
  }
  return await ctx.db
    .query("classwork")
    .withIndex("by_class_subject_and_date", (q) =>
      q.eq("classId", classId).eq("subjectId", subjectId).eq("date", date),
    )
    .take(8);
}

async function removeWork(
  ctx: MutationCtx,
  table: WorkTable,
  id: SavedWork["_id"],
) {
  if (table === "homework") {
    await ctx.db.delete("homework", id as Id<"homework">);
    return;
  }
  await ctx.db.delete("classwork", id as Id<"classwork">);
}

async function patchWork(
  ctx: MutationCtx,
  table: WorkTable,
  id: SavedWork["_id"],
  fields: {
    message: string;
    periodNumber: number;
    enteredBy: Id<"users">;
  },
) {
  if (table === "homework") {
    await ctx.db.patch("homework", id as Id<"homework">, fields);
    return;
  }
  await ctx.db.patch("classwork", id as Id<"classwork">, fields);
}

async function insertWork(
  ctx: MutationCtx,
  table: WorkTable,
  fields: {
    classId: Id<"classes">;
    subjectId: Id<"subjects">;
    periodNumber: number;
    date: string;
    message: string;
    enteredBy: Id<"users">;
  },
) {
  if (table === "homework") {
    await ctx.db.insert("homework", fields);
    return;
  }
  await ctx.db.insert("classwork", fields);
}

export async function rowsForSlots(
  ctx: QueryCtx,
  table: WorkTable,
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

  const savedByClass = new Map<string, SavedWork[]>();
  const classIds = [...new Set(slots.map((slot) => slot.classId))];
  for (const classId of classIds) {
    savedByClass.set(
      classId,
      await listByClassDate(ctx, table, classId, date),
    );
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
    const saved = savedByClass.get(slot.classId) ?? [];
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

export async function mineForDateRows(
  ctx: QueryCtx,
  table: WorkTable,
  date: string,
) {
  const user = await requireRoles(ctx, ["teacher"]);
  const day = weekdayFromIso(date);
  if (!day) {
    return [];
  }
  const slots = (await slotsTaughtBy(ctx, user._id)).filter(
    (slot) => slot.dayOfWeek === day,
  );
  return await rowsForSlots(ctx, table, slots, date);
}

function canReviewClass(user: Doc<"users">, classId: Id<"classes">) {
  return (
    isSchoolAdmin(user) ||
    (user.staffRole === "incharge" && (user.classIds ?? []).includes(classId))
  );
}

export async function forClassDateRows(
  ctx: QueryCtx,
  table: WorkTable,
  classId: Id<"classes">,
  date: string,
) {
  const user = await getCurrentUser(ctx);
  if (!canReviewClass(user, classId)) {
    throw new Error("Unauthorized: insufficient role");
  }
  const day = weekdayFromIso(date);
  if (!day) {
    return [];
  }
  const classroom = await ctx.db.get("classes", classId);
  if (!classroom) {
    throw new Error("Class not found");
  }
  const slots = (
    await ctx.db
      .query("timetables")
      .withIndex("by_class", (q) => q.eq("classId", classId))
      .take(80)
  ).filter((slot) => slot.dayOfWeek === day);
  return await rowsForSlots(ctx, table, slots, date);
}

function assertMessageAndPeriod(table: WorkTable, message: string, periodNumber: number) {
  if (message.length > 1000) {
    throw new ConvexError(`${workLabel(table)} must be 1000 characters or less`);
  }
  if (!Number.isInteger(periodNumber) || periodNumber < 1 || periodNumber > 8) {
    throw new ConvexError("Period number must be between 1 and 8");
  }
}

async function slotsForPeriod(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
  subjectId: Id<"subjects">,
  periodNumber: number,
  day: Weekday,
) {
  return (
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
}

async function assertCanEnter(
  ctx: QueryCtx | MutationCtx,
  table: WorkTable,
  user: Doc<"users">,
  classId: Id<"classes">,
  subjectId: Id<"subjects">,
  periodNumber: number,
  day: Weekday,
) {
  const slots = await slotsForPeriod(ctx, classId, subjectId, periodNumber, day);
  if (slots.length === 0) {
    throw new ConvexError("That subject is not on the timetable for this period");
  }
  const teaches = slots.some(
    (slot) =>
      slot.teacherId === user._id ||
      assistantIdsOf(slot).includes(user._id),
  );
  if (!teaches) {
    throw new ConvexError(
      `Only a teacher assigned to this period can enter ${table}`,
    );
  }
}

async function earliestPeriodForSubject(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
  subjectId: Id<"subjects">,
  day: Weekday,
) {
  const daySlots = (
    await ctx.db
      .query("timetables")
      .withIndex("by_class", (q) => q.eq("classId", classId))
      .take(80)
  ).filter((slot) => slot.dayOfWeek === day && slot.subjectId === subjectId);
  return Math.min(...daySlots.map((slot) => slot.periodNumber));
}

function matchingSaved(
  saved: SavedWork[],
  periodNumber: number,
  earliestPeriod: number,
) {
  return (
    saved.find((row) => row.periodNumber === periodNumber) ??
    (periodNumber === earliestPeriod
      ? saved.find((row) => row.periodNumber === undefined)
      : undefined)
  );
}

async function writeMessage(
  ctx: MutationCtx,
  table: WorkTable,
  existing: SavedWork | undefined,
  args: {
    classId: Id<"classes">;
    subjectId: Id<"subjects">;
    periodNumber: number;
    date: string;
    message: string;
  },
  enteredBy: Id<"users">,
) {
  const message = args.message.trim();
  if (!message) {
    if (existing) {
      await removeWork(ctx, table, existing._id);
    }
    return;
  }
  if (existing) {
    await patchWork(ctx, table, existing._id, {
      message,
      periodNumber: args.periodNumber,
      enteredBy,
    });
    return;
  }
  await insertWork(ctx, table, {
    classId: args.classId,
    subjectId: args.subjectId,
    periodNumber: args.periodNumber,
    date: args.date,
    message,
    enteredBy,
  });
}

export async function saveDailyWork(
  ctx: MutationCtx,
  table: WorkTable,
  args: {
    classId: Id<"classes">;
    subjectId: Id<"subjects">;
    periodNumber: number;
    date: string;
    message: string;
  },
) {
  const user = await requireRoles(ctx, ["teacher"]);
  const day = weekdayFromIso(args.date);
  if (!day) {
    throw new ConvexError("There is no timetable on Sunday");
  }
  assertMessageAndPeriod(table, args.message, args.periodNumber);
  await assertCanEnter(
    ctx,
    table,
    user,
    args.classId,
    args.subjectId,
    args.periodNumber,
    day,
  );
  const earliestPeriod = await earliestPeriodForSubject(
    ctx,
    args.classId,
    args.subjectId,
    day,
  );
  const saved = await listByClassSubjectDate(
    ctx,
    table,
    args.classId,
    args.subjectId,
    args.date,
  );
  await writeMessage(
    ctx,
    table,
    matchingSaved(saved, args.periodNumber, earliestPeriod),
    args,
    user._id,
  );
}

export async function updateDailyWork(
  ctx: MutationCtx,
  table: WorkTable,
  args: {
    classId: Id<"classes">;
    subjectId: Id<"subjects">;
    periodNumber: number;
    date: string;
    message: string;
  },
) {
  const user = await getCurrentUser(ctx);
  if (!canReviewClass(user, args.classId)) {
    throw new Error("Unauthorized: insufficient role");
  }
  const day = weekdayFromIso(args.date);
  if (!day) {
    throw new ConvexError("There is no timetable on Sunday");
  }
  const classroom = await ctx.db.get("classes", args.classId);
  if (!classroom) {
    throw new Error("Class not found");
  }
  assertMessageAndPeriod(table, args.message, args.periodNumber);
  const slots = await slotsForPeriod(
    ctx,
    args.classId,
    args.subjectId,
    args.periodNumber,
    day,
  );
  if (slots.length === 0) {
    throw new ConvexError("That subject is not on the timetable for this period");
  }
  const earliestPeriod = await earliestPeriodForSubject(
    ctx,
    args.classId,
    args.subjectId,
    day,
  );
  const saved = await listByClassSubjectDate(
    ctx,
    table,
    args.classId,
    args.subjectId,
    args.date,
  );
  await writeMessage(
    ctx,
    table,
    matchingSaved(saved, args.periodNumber, earliestPeriod),
    args,
    user._id,
  );
}
