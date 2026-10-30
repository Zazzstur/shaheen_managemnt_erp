import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

type TimetableSlot = Doc<"timetables">;

export function assistantIdsOf(slot: {
  assistantTeacherIds?: Id<"users">[];
  assistantTeacherId?: Id<"users">;
}): Id<"users">[] {
  const ids: Id<"users">[] = [];
  for (const id of slot.assistantTeacherIds ?? []) {
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  if (slot.assistantTeacherId && !ids.includes(slot.assistantTeacherId)) {
    ids.push(slot.assistantTeacherId);
  }
  return ids.slice(0, 2);
}

export async function allTimetableSlots(ctx: QueryCtx | MutationCtx) {
  const slots: TimetableSlot[] = [];
  for (const dayOfWeek of WEEKDAYS) {
    const daySlots = await ctx.db
      .query("timetables")
      .withIndex("by_day", (q) => q.eq("dayOfWeek", dayOfWeek))
      .take(800);
    slots.push(...daySlots);
  }
  return slots;
}

export async function slotsTaughtBy(
  ctx: QueryCtx | MutationCtx,
  teacherId: Id<"users">,
) {
  const slots = await allTimetableSlots(ctx);
  return slots.filter(
    (slot) =>
      slot.teacherId === teacherId ||
      assistantIdsOf(slot).includes(teacherId),
  );
}
