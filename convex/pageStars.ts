import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";

type StarRule = {
  path: string;
  roles: readonly string[];
  staffRoles?: readonly string[];
  alsoStaffRoles?: readonly string[];
};

/** Paths that appear in the sidebar. Dashboard is omitted on purpose. */
const STAR_RULES: readonly StarRule[] = [
  { path: "/admin/students", roles: ["super_admin"] },
  { path: "/students", roles: ["super_admin", "teacher"] },
  { path: "/students/class-change", roles: ["super_admin"] },
  { path: "/students/transfer-certificate", roles: ["super_admin"] },
  { path: "/classes", roles: ["super_admin"] },
  { path: "/timetable", roles: ["super_admin", "teacher", "student", "parent"] },
  {
    path: "/admin/teachers-timetable",
    roles: ["super_admin"],
    alsoStaffRoles: ["incharge"],
  },
  {
    path: "/teacher/attendance",
    roles: ["teacher"],
    staffRoles: ["class_teacher", "incharge"],
  },
  {
    path: "/admin/free-classes",
    roles: ["super_admin"],
    alsoStaffRoles: ["incharge"],
  },
  { path: "/classwork", roles: ["teacher"] },
  { path: "/homework", roles: ["teacher"] },
  {
    path: "/assignment",
    roles: ["super_admin", "teacher"],
    staffRoles: ["incharge"],
  },
  { path: "/report-cards", roles: ["super_admin", "teacher"] },
  { path: "/transport", roles: ["super_admin"] },
  { path: "/fuel", roles: ["super_admin"] },
  { path: "/admin/users", roles: ["super_admin"] },
  { path: "/admin/staff-attendance", roles: ["super_admin"] },
  { path: "/admin/staff-payments", roles: ["super_admin"] },
  { path: "/stock/add", roles: ["super_admin"] },
  {
    path: "/stock/inventory",
    roles: ["super_admin"],
    staffRoles: ["incharge"],
  },
  {
    path: "/stock/give",
    roles: ["super_admin"],
    staffRoles: ["incharge"],
  },
  { path: "/admin/fees", roles: ["super_admin", "parent", "student"] },
  { path: "/expenses", roles: ["super_admin"] },
];

function isInternalAppPath(path: string) {
  if (path.length === 0 || path.length > 80) {
    return false;
  }
  if (!path.startsWith("/") || path.startsWith("//") || path === "/dashboard") {
    return false;
  }
  if (
    path.includes("\\") ||
    path.includes("://") ||
    path.includes("..") ||
    path.includes("//")
  ) {
    return false;
  }
  return /^\/[a-z0-9/-]+$/.test(path);
}

function navRole(user: { role: string; staffRole?: string }) {
  return user.staffRole === "data_entry" ? "super_admin" : user.role;
}

function canOpen(
  rule: StarRule,
  role: string,
  staffRole: string | undefined,
) {
  if (staffRole === "observer") {
    return rule.roles.includes("super_admin");
  }
  if (rule.staffRoles && role === "teacher") {
    return rule.staffRoles.includes(staffRole ?? "");
  }
  if (rule.roles.includes(role)) {
    return true;
  }
  return rule.alsoStaffRoles?.includes(staffRole ?? "") ?? false;
}

function ruleFor(path: string) {
  if (!isInternalAppPath(path)) {
    return null;
  }
  return STAR_RULES.find((rule) => rule.path === path) ?? null;
}

export const list = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    let user;
    try {
      user = await getCurrentUser(ctx);
    } catch {
      return [];
    }
    const rows = await ctx.db
      .query("pageStars")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(40);
    const role = navRole(user);
    return rows
      .map((row) => row.path)
      .filter((path) => {
        const rule = ruleFor(path);
        return rule !== null && canOpen(rule, role, user.staffRole);
      });
  },
});

export const toggle = mutation({
  args: { path: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const rule = ruleFor(args.path);
    if (!rule || !canOpen(rule, navRole(user), user.staffRole)) {
      throw new ConvexError("Choose a page in the app");
    }
    const existing = await ctx.db
      .query("pageStars")
      .withIndex("by_user_and_path", (q) =>
        q.eq("userId", user._id).eq("path", args.path),
      )
      .unique();
    if (existing) {
      await ctx.db.delete("pageStars", existing._id);
      return false;
    }
    await ctx.db.insert("pageStars", {
      userId: user._id,
      path: args.path,
    });
    return true;
  },
});
