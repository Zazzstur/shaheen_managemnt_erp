import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { getCurrentUser, isIsoDate, isSchoolAdmin } from "./lib/auth";
import { attendanceStatusValidator } from "./lib/validators";

const staffRowValidator = v.object({
  teacherId: v.id("users"),
  name: v.string(),
  email: v.optional(v.string()),
  roleLabel: v.string(),
  status: attendanceStatusValidator,
});

function displayName(user: { name?: string; email?: string }) {
  const name = user.name?.trim();
  if (name) {
    return name;
  }
  return user.email?.trim() || "Unnamed staff";
}

function isStaff(user: Doc<"users"> | null): user is Doc<"users"> {
  return (
    user !== null && (user.role === "teacher" || user.role === "super_admin")
  );
}

function roleLabel(user: Doc<"users">) {
  if (user.role === "super_admin") {
    return "Super admin";
  }
  if (user.staffRole === "class_teacher") {
    return "Class teacher";
  }
  if (user.staffRole === "data_entry") {
    return "Data entry";
  }
  if (user.staffRole === "incharge") {
    return "Incharge";
  }
  return "Teacher";
}

async function listStaff(ctx: QueryCtx | MutationCtx) {
  const teachers = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "teacher"))
    .take(200);
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "super_admin"))
    .take(50);
  return [...teachers, ...admins].sort((a, b) =>
    displayName(a).localeCompare(displayName(b)),
  );
}

export const forDate = query({
  args: { date: v.string() },
  returns: v.array(staffRowValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!isSchoolAdmin(user)) {
      throw new Error("Unauthorized: insufficient role");
    }
    if (!isIsoDate(args.date)) {
      throw new ConvexError("Date must be YYYY-MM-DD");
    }
    const staff = await listStaff(ctx);
    const saved = await ctx.db
      .query("staffAttendance")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .take(300);
    const savedByTeacher = new Map(saved.map((row) => [row.teacherId, row.status]));
    const hasSavedAttendance = saved.length > 0;
    const absences = hasSavedAttendance
      ? []
      : await ctx.db
          .query("teacherAbsences")
          .withIndex("by_date", (q) => q.eq("date", args.date))
          .take(300);
    const absentIds = new Set(absences.map((absence) => absence.teacherId));

    return staff.map((teacher) => {
      const email = teacher.email?.trim();
      const savedStatus = savedByTeacher.get(teacher._id);
      const status =
        savedStatus ?? (absentIds.has(teacher._id) ? "absent" : "present");
      return {
        teacherId: teacher._id,
        name: displayName(teacher),
        ...(email ? { email } : {}),
        roleLabel: roleLabel(teacher),
        status,
      };
    });
  },
});

export const save = mutation({
  args: {
    date: v.string(),
    rows: v.array(
      v.object({
        teacherId: v.id("users"),
        status: attendanceStatusValidator,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!isSchoolAdmin(user)) {
      throw new Error("Unauthorized: insufficient role");
    }
    if (!isIsoDate(args.date)) {
      throw new ConvexError("Date must be YYYY-MM-DD");
    }
    if (args.rows.length > 250) {
      throw new ConvexError("Too many staff rows");
    }
    const seen = new Set<Id<"users">>();
    for (const row of args.rows) {
      if (seen.has(row.teacherId)) {
        throw new ConvexError("Each staff member can only be saved once");
      }
      seen.add(row.teacherId);
      const teacher = await ctx.db.get("users", row.teacherId);
      if (!isStaff(teacher)) {
        throw new ConvexError("Staff member not found");
      }
    }

    const existingAttendance = await ctx.db
      .query("staffAttendance")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .take(300);
    for (const row of existingAttendance) {
      await ctx.db.delete("staffAttendance", row._id);
    }
    for (const row of args.rows) {
      await ctx.db.insert("staffAttendance", {
        date: args.date,
        teacherId: row.teacherId,
        status: row.status,
        markedBy: user._id,
      });
    }

    const absentIds = new Set(
      args.rows
        .filter((row) => row.status === "absent")
        .map((row) => row.teacherId),
    );
    const existingAbsences = await ctx.db
      .query("teacherAbsences")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .take(300);
    for (const absence of existingAbsences) {
      if (absentIds.has(absence.teacherId)) {
        absentIds.delete(absence.teacherId);
      } else {
        await ctx.db.delete("teacherAbsences", absence._id);
      }
    }
    for (const teacherId of absentIds) {
      await ctx.db.insert("teacherAbsences", {
        date: args.date,
        teacherId,
      });
    }

    const covers = await ctx.db
      .query("freeClassCovers")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .take(500);
    const stillAbsent = new Set(
      args.rows
        .filter((row) => row.status === "absent")
        .map((row) => row.teacherId),
    );
    for (const cover of covers) {
      if (stillAbsent.has(cover.coverTeacherId)) {
        await ctx.db.delete("freeClassCovers", cover._id);
      }
    }
    return null;
  },
});
