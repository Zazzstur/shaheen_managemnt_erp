import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getCurrentUser, requireSuperAdmin } from "./lib/auth";
import { userDocValidator, userRoleValidator } from "./lib/validators";

export const me = query({
  args: {},
  returns: v.union(userDocValidator, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    try {
      return await getCurrentUser(ctx);
    } catch {
      return null;
    }
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    role: v.optional(userRoleValidator),
  },
  returns: v.object({
    page: v.array(userDocValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(
        v.null(),
        v.literal("SplitRecommended"),
        v.literal("SplitRequired"),
      ),
    ),
  }),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    if (args.role) {
      return await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", args.role!))
        .paginate(args.paginationOpts);
    }
    return await ctx.db.query("users").order("desc").paginate(args.paginationOpts);
  },
});

export const listByRole = query({
  args: { role: userRoleValidator },
  returns: v.array(userDocValidator),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    return await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .take(200);
  },
});

export const listTeachers = query({
  args: {},
  returns: v.array(userDocValidator),
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    return await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "teacher"))
      .take(200);
  },
});

export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: userRoleValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireSuperAdmin(ctx);
    if (admin._id === args.userId && args.role !== "super_admin") {
      throw new Error("You cannot remove your own super admin role");
    }
    const target = await ctx.db.get("users", args.userId);
    if (!target) {
      throw new Error("User not found");
    }
    await ctx.db.patch("users", args.userId, { role: args.role });
    return null;
  },
});

export const setStatus = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("suspended"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireSuperAdmin(ctx);
    if (admin._id === args.userId && args.status !== "active") {
      throw new Error("You cannot deactivate your own account");
    }
    const target = await ctx.db.get("users", args.userId);
    if (!target) {
      throw new Error("User not found");
    }
    await ctx.db.patch("users", args.userId, { status: args.status });
    return null;
  },
});

export const assertSuperAdmin = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    return null;
  },
});

export const teacherEmailTaken = internalQuery({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
    return existing !== null;
  },
});

export const createTeacher = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.users.assertSuperAdmin, {});
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    if (!name) {
      throw new Error("Name is required");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email");
    }
    if (args.password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    const taken = await ctx.runQuery(internal.users.teacherEmailTaken, {
      email,
    });
    if (taken) {
      throw new Error("An account with this email already exists");
    }
    await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: {
        email,
        name,
        role: "teacher",
        status: "active",
      },
    });
    return null;
  },
});
