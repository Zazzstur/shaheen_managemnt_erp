import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { UserRole } from "./roles";

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (user.status !== "active") {
    throw new Error("Account is not active");
  }

  return user;
}

export async function requireRoles(
  ctx: QueryCtx | MutationCtx,
  roles: ReadonlyArray<UserRole>,
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!roles.includes(user.role)) {
    throw new Error("Unauthorized: insufficient role");
  }
  return user;
}

export function isSchoolAdmin(user: {
  role: string;
  staffRole?: string;
}): boolean {
  return user.role === "super_admin" || user.staffRole === "data_entry";
}

export async function requireSchoolAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!isSchoolAdmin(user)) {
    throw new Error("Unauthorized: insufficient role");
  }
  return user;
}

export async function requireRolesIncludingDataEntry(
  ctx: QueryCtx | MutationCtx,
  roles: ReadonlyArray<UserRole>,
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (user.staffRole === "data_entry" && roles.includes("super_admin")) {
    return user;
  }
  if (!roles.includes(user.role)) {
    throw new Error("Unauthorized: insufficient role");
  }
  return user;
}

export async function requireSuperAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  return await requireRoles(ctx, ["super_admin"]);
}

export async function requireClassTeacherForClass(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (user.staffRole !== "class_teacher" || user.classId === undefined) {
    throw new Error("Only a class teacher can take attendance");
  }
  if (user.classId !== classId) {
    throw new Error("You can only take attendance for your assigned class");
  }
  return user;
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function assertStudentAccess(
  ctx: QueryCtx | MutationCtx,
  studentId: Id<"students">,
  user: Doc<"users">,
): Promise<Doc<"students">> {
  const student = await ctx.db.get("students", studentId);
  if (!student) {
    throw new Error("Student not found");
  }

  if (user.role === "super_admin" || user.role === "teacher") {
    return student;
  }

  if (user.role === "student" && student.userId === user._id) {
    return student;
  }

  if (user.role === "parent" && student.guardianUserId === user._id) {
    return student;
  }

  throw new Error("Unauthorized: cannot access this student record");
}
