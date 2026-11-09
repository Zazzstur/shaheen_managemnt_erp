import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSchoolAdmin, requireSchoolViewer } from "./lib/auth";

const MAX_AMOUNT = 10_000_000;
const MAX_DESCRIPTION = 200;

function todayInIndia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function assertAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConvexError("Amount must be greater than 0");
  }
  if (value > MAX_AMOUNT) {
    throw new ConvexError("Amount must be at most 10,000,000");
  }
  if (Math.round(value * 100) / 100 !== value) {
    throw new ConvexError("Amount can have at most 2 decimal places");
  }
}

function assertDescription(value: string) {
  const description = value.trim();
  if (!description) {
    throw new ConvexError("Enter a description");
  }
  if (description.length > MAX_DESCRIPTION) {
    throw new ConvexError("Description is too long");
  }
  return description;
}

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("officeExpenses"),
      date: v.string(),
      description: v.string(),
      amount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireSchoolViewer(ctx);
    const rows = await ctx.db
      .query("officeExpenses")
      .withIndex("by_date")
      .order("desc")
      .take(200);
    return rows.map((row) => ({
      id: row._id,
      date: row.date,
      description: row.description,
      amount: row.amount,
    }));
  },
});

export const create = mutation({
  args: {
    amount: v.number(),
    description: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireSchoolAdmin(ctx);
    assertAmount(args.amount);
    const description = assertDescription(args.description);
    await ctx.db.insert("officeExpenses", {
      amount: args.amount,
      description,
      date: todayInIndia(),
      recordedBy: user._id,
    });
    return null;
  },
});
