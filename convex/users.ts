import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import {
  action,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { type Doc, type Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getCurrentUser, requireSuperAdmin } from "./lib/auth";
import {
  staffRoleValidator,
  userDocValidator,
  userRoleValidator,
} from "./lib/validators";

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

async function assertClassTeacherAvailable(
  ctx: MutationCtx,
  classId: Id<"classes">,
  exceptUserId?: Id<"users">,
) {
  const classroom = await ctx.db.get("classes", classId);
  if (!classroom) {
    throw new ConvexError("Class not found");
  }
  const holders = await ctx.db
    .query("users")
    .withIndex("by_class", (q) => q.eq("classId", classId))
    .take(10);
  const taken = holders.some(
    (user) => user._id !== exceptUserId && user.staffRole === "class_teacher",
  );
  if (taken) {
    throw new ConvexError("That class already has a class teacher");
  }
}

async function existingClassIds(ctx: MutationCtx, classIds: Id<"classes">[]) {
  const unique = [...new Set(classIds)];
  if (unique.length > 40) {
    throw new ConvexError("Select 40 classes or fewer");
  }
  for (const classId of unique) {
    const classroom = await ctx.db.get("classes", classId);
    if (!classroom) {
      throw new ConvexError("Class not found");
    }
  }
  return unique;
}

function staffProfile(
  target: Doc<"users">,
  staffRole: Doc<"users">["staffRole"],
  classId?: Id<"classes">,
  classIds?: Id<"classes">[],
) {
  const {
    _id,
    _creationTime,
    classId: _classId,
    classIds: _classIds,
    ...rest
  } = target;
  return {
    ...rest,
    staffRole,
    ...(classId ? { classId } : {}),
    ...(classIds && classIds.length > 0 ? { classIds } : {}),
  };
}

export const setStaffRole = mutation({
  args: {
    userId: v.id("users"),
    staffRole: staffRoleValidator,
    classId: v.optional(v.id("classes")),
    classIds: v.optional(v.array(v.id("classes"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const target = await ctx.db.get("users", args.userId);
    if (!target) {
      throw new ConvexError("User not found");
    }
    if (target.role !== "teacher") {
      throw new ConvexError("Staff roles can only be assigned to teacher logins");
    }
    if (args.staffRole === "class_teacher" && args.classId) {
      await assertClassTeacherAvailable(ctx, args.classId, args.userId);
      await ctx.db.replace(
        "users",
        args.userId,
        staffProfile(target, "class_teacher", args.classId),
      );
      return null;
    }
    if (args.staffRole === "class_teacher") {
      await ctx.db.replace(
        "users",
        args.userId,
        staffProfile(target, "class_teacher", target.classId),
      );
      return null;
    }
    if (args.staffRole === "incharge") {
      const classIds = await existingClassIds(
        ctx,
        args.classIds ?? (target.staffRole === "incharge" ? target.classIds ?? [] : []),
      );
      await ctx.db.replace(
        "users",
        args.userId,
        staffProfile(target, "incharge", undefined, classIds),
      );
      return null;
    }
    await ctx.db.replace(
      "users",
      args.userId,
      staffProfile(target, args.staffRole),
    );
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

export const assertClassAvailable = internalQuery({
  args: { classId: v.id("classes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const holders = await ctx.db
      .query("users")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(10);
    if (holders.some((user) => user.staffRole === "class_teacher")) {
      throw new Error("That class already has a class teacher");
    }
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

export const assertClassesExist = internalQuery({
  args: { classIds: v.array(v.id("classes")) },
  returns: v.array(v.id("classes")),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const unique = [...new Set(args.classIds)];
    if (unique.length === 0) {
      throw new Error("Select at least one class for the incharge");
    }
    if (unique.length > 40) {
      throw new Error("Select 40 classes or fewer");
    }
    for (const classId of unique) {
      const classroom = await ctx.db.get("classes", classId);
      if (!classroom) {
        throw new Error("Class not found");
      }
    }
    return unique;
  },
});

export const createTeacher = action({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    staffRole: v.optional(staffRoleValidator),
    classId: v.optional(v.id("classes")),
    classIds: v.optional(v.array(v.id("classes"))),
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
    const staffRole = args.staffRole ?? "teacher";
    if (staffRole === "class_teacher" && !args.classId) {
      throw new Error("Select a class for the class teacher");
    }
    if (staffRole === "class_teacher" && args.classId) {
      await ctx.runQuery(internal.users.assertClassAvailable, {
        classId: args.classId,
      });
    }
    const classIds =
      staffRole === "incharge"
        ? await ctx.runQuery(internal.users.assertClassesExist, {
            classIds: args.classIds ?? [],
          })
        : [];
    await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: {
        email,
        name,
        role: "teacher",
        status: "active",
        staffRole,
        ...(staffRole === "class_teacher" && args.classId
          ? { classId: args.classId }
          : {}),
        ...(staffRole === "incharge" ? { classIds } : {}),
      },
    });
    return null;
  },
});
