import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, isIsoDate, requireClassTeacherForClass } from "./lib/auth";
import { attendanceStatusValidator } from "./lib/validators";
import { studentName } from "./lib/studentName";

const rosterItemValidator = v.object({
  studentId: v.id("students"),
  admissionNumber: v.string(),
  name: v.string(),
  status: v.union(attendanceStatusValidator, v.null()),
});

const submissionValidator = v.object({
  classId: v.id("classes"),
  classLabel: v.string(),
  classTeacherName: v.string(),
  status: v.union(
    v.literal("submitted"),
    v.literal("partial"),
    v.literal("missing"),
  ),
  presentCount: v.number(),
  absentCount: v.number(),
  lateCount: v.number(),
  markedCount: v.number(),
  enrolledCount: v.number(),
});

export const submissionForDate = query({
  args: { date: v.string() },
  returns: v.array(submissionValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (user.staffRole !== "incharge") {
      throw new Error("Only an incharge can review attendance submission");
    }
    if (!isIsoDate(args.date)) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    const rows = [];
    for (const classId of user.classIds ?? []) {
      const classroom = await ctx.db.get("classes", classId);
      if (!classroom) {
        continue;
      }
      const students = await ctx.db
        .query("students")
        .withIndex("by_class", (q) => q.eq("classId", classId))
        .take(80);
      const enrolled = students.filter((student) => student.status === "enrolled");
      let presentCount = 0;
      let absentCount = 0;
      let lateCount = 0;
      for (const student of enrolled) {
        const existing = await ctx.db
          .query("attendance")
          .withIndex("by_student_and_date", (q) =>
            q.eq("studentId", student._id).eq("date", args.date),
          )
          .unique();
        if (existing?.status === "present") {
          presentCount += 1;
        } else if (existing?.status === "absent") {
          absentCount += 1;
        } else if (existing?.status === "late") {
          lateCount += 1;
        }
      }
      const markedCount = presentCount + absentCount + lateCount;
      const holders = await ctx.db
        .query("users")
        .withIndex("by_class", (q) => q.eq("classId", classId))
        .take(10);
      const classTeacher = holders.find(
        (holder) => holder.staffRole === "class_teacher",
      );
      const enrolledCount = enrolled.length;
      rows.push({
        classId,
        classLabel: `${classroom.name} ${classroom.section}`.trim(),
        classTeacherName:
          classTeacher?.name ?? classTeacher?.email ?? "No class teacher",
        status:
          markedCount === 0
            ? ("missing" as const)
            : enrolledCount > 0 && markedCount >= enrolledCount
              ? ("submitted" as const)
              : ("partial" as const),
        presentCount,
        absentCount,
        lateCount,
        markedCount,
        enrolledCount,
      });
    }
    rows.sort((a, b) => a.classLabel.localeCompare(b.classLabel));
    return rows;
  },
});

export const rosterForClassDate = query({
  args: {
    classId: v.id("classes"),
    date: v.string(),
  },
  returns: v.array(rosterItemValidator),
  handler: async (ctx, args) => {
    await requireClassTeacherForClass(ctx, args.classId);
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
    const marker = await requireClassTeacherForClass(ctx, args.classId);
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
