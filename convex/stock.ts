import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import {
  canViewSchoolAdmin,
  getCurrentUser,
  isIsoDate,
  isSchoolAdmin,
} from "./lib/auth";

const MAX_QUANTITY = 100_000;

function isIncharge(user: Doc<"users">) {
  return user.role === "teacher" && user.staffRole === "incharge";
}

function canManageStock(user: Doc<"users">) {
  return isSchoolAdmin(user) || isIncharge(user);
}

function canViewStock(user: Doc<"users">) {
  return canViewSchoolAdmin(user) || isIncharge(user);
}

async function requireStockUser(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (!canManageStock(user)) {
    throw new Error("Unauthorized: insufficient role");
  }
  return user;
}

async function requireStockViewer(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (!canViewStock(user)) {
    throw new Error("Unauthorized: insufficient role");
  }
  return user;
}

function nameKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function displayName(user: { name?: string; email?: string }) {
  return user.name?.trim() || user.email?.trim() || "Unnamed staff";
}

function assertQuantity(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_QUANTITY) {
    throw new ConvexError("Enter a whole quantity from 1 to 100000");
  }
}

function assertPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    throw new ConvexError("Enter a price greater than 0");
  }
  if (Math.round(value * 100) / 100 !== value) {
    throw new ConvexError("Price can have at most 2 decimal places");
  }
}

function unitFromTotal(total: number, quantity: number) {
  const unit = Math.round((total / quantity) * 100) / 100;
  if (unit <= 0) {
    throw new ConvexError("Price is too small for this quantity");
  }
  return unit;
}

function blendedUnit(
  oldQuantity: number,
  oldUnit: number | undefined,
  addQuantity: number,
  addTotal: number,
) {
  if (oldQuantity <= 0 || oldUnit === undefined) {
    return unitFromTotal(addTotal, addQuantity);
  }
  const cost = oldQuantity * oldUnit + addTotal;
  const unit = Math.round((cost / (oldQuantity + addQuantity)) * 100) / 100;
  if (unit <= 0) {
    throw new ConvexError("Price is too small for this quantity");
  }
  return unit;
}

function todayInIndia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

async function recordPurchase(
  ctx: MutationCtx,
  purchase: {
    itemId: Id<"stockItems">;
    quantity: number;
    total: number;
    recordedBy: Id<"users">;
  },
) {
  await ctx.db.insert("stockPurchases", {
    itemId: purchase.itemId,
    date: todayInIndia(),
    quantity: purchase.quantity,
    total: purchase.total,
    recordedBy: purchase.recordedBy,
  });
}

function isTeacherRecipient(user: Doc<"users">) {
  return (
    user.role === "teacher" &&
    user.status === "active" &&
    (user.staffRole === undefined ||
      user.staffRole === "teacher" ||
      user.staffRole === "class_teacher")
  );
}

async function holdingFor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  itemId: Id<"stockItems">,
) {
  return await ctx.db
    .query("stockHoldings")
    .withIndex("by_user_and_item", (q) =>
      q.eq("userId", userId).eq("itemId", itemId),
    )
    .unique();
}

const itemValidator = v.object({
  itemId: v.id("stockItems"),
  name: v.string(),
  quantity: v.number(),
  price: v.optional(v.number()),
  lent: v.optional(v.number()),
});

const personValidator = v.object({
  userId: v.id("users"),
  name: v.string(),
});

const issueValidator = v.object({
  issueId: v.id("stockIssues"),
  itemName: v.string(),
  quantity: v.number(),
  outstanding: v.number(),
  date: v.string(),
  fromName: v.string(),
  toName: v.string(),
  note: v.optional(v.string()),
  canReturn: v.boolean(),
});

async function lentByItem(
  ctx: QueryCtx,
  fromUserId: Id<"users"> | undefined,
) {
  const issues = fromUserId
    ? await ctx.db
        .query("stockIssues")
        .withIndex("by_from", (q) => q.eq("fromUserId", fromUserId))
        .take(400)
    : await ctx.db
        .query("stockIssues")
        .withIndex("by_mode", (q) => q.eq("mode", "lend"))
        .take(400);
  const counts = new Map<Id<"stockItems">, number>();
  for (const issue of issues) {
    if (issue.mode !== "lend") {
      continue;
    }
    if (!fromUserId) {
      const from = await ctx.db.get("users", issue.fromUserId);
      if (!from || !isSchoolAdmin(from)) {
        continue;
      }
    }
    const outstanding = issue.quantity - issue.returnedQuantity;
    if (outstanding <= 0) {
      continue;
    }
    counts.set(issue.itemId, (counts.get(issue.itemId) ?? 0) + outstanding);
  }
  return counts;
}

export const inventory = query({
  args: {},
  returns: v.array(itemValidator),
  handler: async (ctx) => {
    const user = await requireStockViewer(ctx);
    const viewAll = canViewSchoolAdmin(user);
    const lent = await lentByItem(ctx, viewAll ? undefined : user._id);
    if (viewAll) {
      const items = await ctx.db.query("stockItems").take(300);
      return items
        .map((item) => ({
          itemId: item._id,
          name: item.name,
          quantity: item.quantity,
          lent: lent.get(item._id) ?? 0,
          ...(item.price !== undefined ? { price: item.price } : {}),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    const holdings = await ctx.db
      .query("stockHoldings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(300);
    const seen = new Set<Id<"stockItems">>();
    const rows = [];
    for (const holding of holdings) {
      seen.add(holding.itemId);
      const outstanding = lent.get(holding.itemId) ?? 0;
      if (holding.quantity <= 0 && outstanding <= 0) {
        continue;
      }
      const item = await ctx.db.get("stockItems", holding.itemId);
      if (!item) {
        continue;
      }
      rows.push({
        itemId: item._id,
        name: item.name,
        quantity: holding.quantity,
        lent: outstanding,
        ...(item.price !== undefined ? { price: item.price } : {}),
      });
    }
    for (const [itemId, outstanding] of lent) {
      if (seen.has(itemId) || outstanding <= 0) {
        continue;
      }
      const item = await ctx.db.get("stockItems", itemId);
      if (!item) {
        continue;
      }
      rows.push({
        itemId: item._id,
        name: item.name,
        quantity: 0,
        lent: outstanding,
        ...(item.price !== undefined ? { price: item.price } : {}),
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const giveOptions = query({
  args: {},
  returns: v.object({
    items: v.array(itemValidator),
    people: v.array(personValidator),
    givesTo: v.union(v.literal("incharge"), v.literal("teacher")),
  }),
  handler: async (ctx) => {
    const user = await requireStockViewer(ctx);
    const admin = canViewSchoolAdmin(user);
    const available: Array<{
      itemId: Id<"stockItems">;
      name: string;
      quantity: number;
      price?: number;
    }> = [];
    if (admin) {
      const items = await ctx.db.query("stockItems").take(300);
      for (const item of items) {
        if (item.quantity > 0) {
          available.push({
            itemId: item._id,
            name: item.name,
            quantity: item.quantity,
            ...(item.price !== undefined ? { price: item.price } : {}),
          });
        }
      }
    } else {
      const holdings = await ctx.db
        .query("stockHoldings")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(300);
      for (const holding of holdings) {
        if (holding.quantity <= 0) {
          continue;
        }
        const item = await ctx.db.get("stockItems", holding.itemId);
        if (!item) {
          continue;
        }
        available.push({
          itemId: item._id,
          name: item.name,
          quantity: holding.quantity,
          ...(item.price !== undefined ? { price: item.price } : {}),
        });
      }
    }

    const people = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "teacher"))
      .take(200);
    const recipients = people
      .filter((person) =>
        person.status === "active" &&
        (admin ? isIncharge(person) : isTeacherRecipient(person)),
      )
      .map((person) => ({
        userId: person._id,
        name: displayName(person),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const givesTo = admin ? ("incharge" as const) : ("teacher" as const);
    return {
      items: available.sort((a, b) => a.name.localeCompare(b.name)),
      people: recipients,
      givesTo,
    };
  },
});

export const searchItems = query({
  args: { term: v.string() },
  returns: v.array(itemValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!canViewSchoolAdmin(user)) {
      throw new Error("Unauthorized: insufficient role");
    }
    const term = nameKey(args.term);
    if (!term) {
      return [];
    }
    const items = await ctx.db.query("stockItems").take(300);
    return items
      .filter((item) => item.nameKey.includes(term))
      .sort((a, b) => {
        const aExact = a.nameKey === term ? 0 : 1;
        const bExact = b.nameKey === term ? 0 : 1;
        return aExact - bExact || a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map((item) => ({
        itemId: item._id,
        name: item.name,
        quantity: item.quantity,
        ...(item.price !== undefined ? { price: item.price } : {}),
      }));
  },
});

export const addItem = mutation({
  args: {
    name: v.string(),
    quantity: v.number(),
    price: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!isSchoolAdmin(user)) {
      throw new Error("Unauthorized: insufficient role");
    }
    const name = args.name.trim().replace(/\s+/g, " ");
    const key = nameKey(name);
    if (!key || name.length > 80) {
      throw new ConvexError("Enter a product name");
    }
    assertQuantity(args.quantity);
    assertPrice(args.price);
    const existing = await ctx.db
      .query("stockItems")
      .withIndex("by_name", (q) => q.eq("nameKey", key))
      .unique();
    if (existing) {
      const next = existing.quantity + args.quantity;
      if (next > MAX_QUANTITY) {
        throw new ConvexError("That would put this item over the quantity limit");
      }
      await ctx.db.patch("stockItems", existing._id, {
        quantity: next,
        price: blendedUnit(
          existing.quantity,
          existing.price,
          args.quantity,
          args.price,
        ),
      });
      await recordPurchase(ctx, {
        itemId: existing._id,
        quantity: args.quantity,
        total: args.price,
        recordedBy: user._id,
      });
      return null;
    }
    const itemId = await ctx.db.insert("stockItems", {
      name,
      nameKey: key,
      quantity: args.quantity,
      price: unitFromTotal(args.price, args.quantity),
    });
    await recordPurchase(ctx, {
      itemId,
      quantity: args.quantity,
      total: args.price,
      recordedBy: user._id,
    });
    return null;
  },
});

export const give = mutation({
  args: {
    itemId: v.id("stockItems"),
    quantity: v.number(),
    mode: v.union(v.literal("give"), v.literal("lend")),
    toUserId: v.id("users"),
    date: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireStockUser(ctx);
    const admin = isSchoolAdmin(user);
    assertQuantity(args.quantity);
    if (!isIsoDate(args.date) || args.date > todayInIndia()) {
      throw new ConvexError("Enter a valid date");
    }
    const note = args.note?.trim().replace(/\s+/g, " ") ?? "";
    if (note.length > 200) {
      throw new ConvexError("Note must be 200 characters or less");
    }
    const item = await ctx.db.get("stockItems", args.itemId);
    if (!item) {
      throw new ConvexError("Item not found");
    }
    const recipient = await ctx.db.get("users", args.toUserId);
    if (!recipient || recipient.status !== "active") {
      throw new ConvexError("Choose a person to receive the item");
    }
    if (admin) {
      if (!isIncharge(recipient)) {
        throw new ConvexError("Office stock can only be given to an incharge");
      }
      if (item.quantity < args.quantity) {
        throw new ConvexError("Not enough of this item in inventory");
      }
      await ctx.db.patch("stockItems", item._id, {
        quantity: item.quantity - args.quantity,
      });
      await addHolding(ctx, recipient._id, item._id, args.quantity);
    } else {
      if (!isTeacherRecipient(recipient)) {
        throw new ConvexError("Choose a teacher");
      }
      const holding = await holdingFor(ctx, user._id, item._id);
      if (!holding || holding.quantity < args.quantity) {
        throw new ConvexError("Not enough of this item in your stock");
      }
      await ctx.db.patch("stockHoldings", holding._id, {
        quantity: holding.quantity - args.quantity,
      });
    }
    await ctx.db.insert("stockIssues", {
      itemId: item._id,
      quantity: args.quantity,
      mode: args.mode,
      fromUserId: user._id,
      toUserId: recipient._id,
      date: args.date,
      returnedQuantity: 0,
      ...(note ? { note } : {}),
      recordedBy: user._id,
    });
    return null;
  },
});

async function addHolding(
  ctx: MutationCtx,
  userId: Id<"users">,
  itemId: Id<"stockItems">,
  quantity: number,
) {
  const holding = await holdingFor(ctx, userId, itemId);
  if (holding) {
    await ctx.db.patch("stockHoldings", holding._id, {
      quantity: holding.quantity + quantity,
    });
    return;
  }
  await ctx.db.insert("stockHoldings", { userId, itemId, quantity });
}

async function takeHolding(
  ctx: MutationCtx,
  userId: Id<"users">,
  itemId: Id<"stockItems">,
  quantity: number,
) {
  const holding = await holdingFor(ctx, userId, itemId);
  if (!holding || holding.quantity < quantity) {
    throw new ConvexError("The incharge no longer has that many of this item to return");
  }
  const next = holding.quantity - quantity;
  if (next === 0) {
    await ctx.db.delete("stockHoldings", holding._id);
    return;
  }
  await ctx.db.patch("stockHoldings", holding._id, { quantity: next });
}

export const issues = query({
  args: { mode: v.union(v.literal("give"), v.literal("lend")) },
  returns: v.array(issueValidator),
  handler: async (ctx, args) => {
    const user = await requireStockViewer(ctx);
    const viewAll = canViewSchoolAdmin(user);
    const canEdit = isSchoolAdmin(user);
    const rows = viewAll
      ? await ctx.db
          .query("stockIssues")
          .withIndex("by_mode", (q) => q.eq("mode", args.mode))
          .take(400)
      : await ctx.db
          .query("stockIssues")
          .withIndex("by_from", (q) => q.eq("fromUserId", user._id))
          .take(400);
    const visible = viewAll ? rows : rows.filter((row) => row.mode === args.mode);
    const result = [];
    for (const row of visible) {
      const item = await ctx.db.get("stockItems", row.itemId);
      const from = await ctx.db.get("users", row.fromUserId);
      const to = await ctx.db.get("users", row.toUserId);
      const outstanding = row.quantity - row.returnedQuantity;
      result.push({
        issueId: row._id,
        itemName: item?.name ?? "Removed item",
        quantity: row.quantity,
        outstanding,
        date: row.date,
        fromName: from ? displayName(from) : "Unknown",
        toName: to ? displayName(to) : "Unknown",
        ...(row.note ? { note: row.note } : {}),
        canReturn:
          args.mode === "lend" &&
          outstanding > 0 &&
          (canEdit || row.fromUserId === user._id),
      });
    }
    return result.sort(
      (a, b) => b.date.localeCompare(a.date) || a.itemName.localeCompare(b.itemName),
    );
  },
});

export const returnLent = mutation({
  args: {
    issueId: v.id("stockIssues"),
    quantity: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireStockUser(ctx);
    assertQuantity(args.quantity);
    const issue = await ctx.db.get("stockIssues", args.issueId);
    if (!issue || issue.mode !== "lend") {
      throw new ConvexError("Lent item not found");
    }
    if (!isSchoolAdmin(user) && issue.fromUserId !== user._id) {
      throw new Error("Unauthorized: insufficient role");
    }
    const outstanding = issue.quantity - issue.returnedQuantity;
    if (args.quantity > outstanding) {
      throw new ConvexError("That is more than the quantity still out");
    }
    const recipient = await ctx.db.get("users", issue.toUserId);
    if (recipient && isIncharge(recipient)) {
      await takeHolding(ctx, recipient._id, issue.itemId, args.quantity);
    }
    const lender = await ctx.db.get("users", issue.fromUserId);
    if (lender && isSchoolAdmin(lender)) {
      const item = await ctx.db.get("stockItems", issue.itemId);
      if (!item) {
        throw new ConvexError("Item not found");
      }
      await ctx.db.patch("stockItems", item._id, {
        quantity: item.quantity + args.quantity,
      });
    } else {
      await addHolding(ctx, issue.fromUserId, issue.itemId, args.quantity);
    }
    await ctx.db.patch("stockIssues", issue._id, {
      returnedQuantity: issue.returnedQuantity + args.quantity,
    });
    return null;
  },
});
