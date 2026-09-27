import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isIsoDate, requireRoles } from "./lib/auth";
import { attendanceStatusValidator } from "./lib/validators";
import { studentName } from "./lib/studentName";

const rosterItemValidator = v.object({
  studentId: v.id("students"),
  admissionNumber: v.string(),
  name: v.string(),
  status: v.union(attendanceStatusValidator, v.null()),
});

export const rosterForClassDate = query({
  args: {
    classId: v.id("classes"),
    date: v.string(),
  },
  returns: v.array(rosterItemValidator),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin", "teacher"]);
    if (!isIsoDate(args.date)) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    const students = await ctx.db
      .query("students")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);
    const roster = [];
    for (const student of students) {
      if (student.status !== "enrolled") {
        continue;
      }
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_student_and_date", (q) =>
          q.eq("studentId", student._id).eq("date", args.date),
        )
        .unique();
      roster.push({
        studentId: student._id,
        admissionNumber: student.admissionNumber,
        name: studentName(student),
        status: existing?.status ?? null,
      });
    }
    return roster;
  },
});

export const markBatch = mutation({
  args: {
    classId: v.id("classes"),
    date: v.string(),
    records: v.array(
      v.object({
        studentId: v.id("students"),
        status: attendanceStatusValidator,
      }),
    ),
  },
  returns: v.object({ saved: v.number() }),
  handler: async (ctx, args) => {
    const marker = await requireRoles(ctx, ["super_admin", "teacher"]);
    if (!isIsoDate(args.date)) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    if (args.records.length === 0) {
      throw new Error("No attendance records provided");
    }
    if (args.records.length > 80) {
      throw new Error("Too many attendance records in one batch");
    }
    let saved = 0;
    for (const record of args.records) {
      const student = await ctx.db.get("students", record.studentId);
      if (!student || student.classId !== args.classId) {
        throw new Error("Student is not in the selected class");
      }
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_student_and_date", (q) =>
          q.eq("studentId", record.studentId).eq("date", args.date),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("attendance", existing._id, {
          status: record.status,
          markedBy: marker._id,
        });
      } else {
        await ctx.db.insert("attendance", {
          studentId: record.studentId,
          date: args.date,
          status: record.status,
          markedBy: marker._id,
        });
      }
      saved += 1;
    }
    return { saved };
  },
});
