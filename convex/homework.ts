import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  forClassDateRows,
  mineForDateRows,
  saveDailyWork,
  updateDailyWork,
  workRowValidator,
} from "./lib/dailyWork";

const args = {
  classId: v.id("classes"),
  subjectId: v.id("subjects"),
  periodNumber: v.number(),
  date: v.string(),
  message: v.string(),
};

export const mineForDate = query({
  args: { date: v.string() },
  returns: v.array(workRowValidator),
  handler: async (ctx, args) => mineForDateRows(ctx, "homework", args.date),
});

export const forClassDate = query({
  args: {
    classId: v.id("classes"),
    date: v.string(),
  },
  returns: v.array(workRowValidator),
  handler: async (ctx, args) =>
    forClassDateRows(ctx, "homework", args.classId, args.date),
});

export const save = mutation({
  args,
  returns: v.null(),
  handler: async (ctx, args) => {
    await saveDailyWork(ctx, "homework", args);
    return null;
  },
});

export const update = mutation({
  args,
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateDailyWork(ctx, "homework", args);
    return null;
  },
});
