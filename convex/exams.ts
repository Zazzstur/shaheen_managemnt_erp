import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isIsoDate, requireRoles } from "./lib/auth";

const examDocValidator = v.object({
  _id: v.id("exams"),
  _creationTime: v.number(),
  title: v.string(),
  classId: v.id("classes"),
  subjectId: v.id("subjects"),
  date: v.string(),
  maxMarks: v.number(),
});

export const listByClass = query({
  args: { classId: v.id("classes") },
  returns: v.array(examDocValidator),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin", "teacher"]);
    return await ctx.db
      .query("exams")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(50);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    classId: v.id("classes"),
    subjectId: v.id("subjects"),
    date: v.string(),
    maxMarks: v.number(),
  },
  returns: v.id("exams"),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin", "teacher"]);
    const title = args.title.trim();
    if (!title) {
      throw new Error("Exam title is required");
    }
    if (!isIsoDate(args.date)) {
      throw new Error("Exam date must be YYYY-MM-DD");
    }
    if (!Number.isFinite(args.maxMarks) || args.maxMarks <= 0) {
      throw new Error("Max marks must be greater than 0");
    }
    return await ctx.db.insert("exams", {
      title,
      classId: args.classId,
      subjectId: args.subjectId,
      date: args.date,
      maxMarks: args.maxMarks,
    });
  },
});

export const recordMark = mutation({
  args: {
    examId: v.id("exams"),
    studentId: v.id("students"),
    marksObtained: v.number(),
    remarks: v.optional(v.string()),
  },
  returns: v.id("marks"),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin", "teacher"]);
    const exam = await ctx.db.get("exams", args.examId);
    if (!exam) {
      throw new Error("Exam not found");
    }
    const student = await ctx.db.get("students", args.studentId);
    if (!student) {
      throw new Error("Student not found");
    }
    if (student.classId !== exam.classId) {
      throw new Error("Student is not in this exam class");
    }
    if (
      !Number.isFinite(args.marksObtained) ||
      args.marksObtained < 0 ||
      args.marksObtained > exam.maxMarks
    ) {
      throw new Error("Marks must be between 0 and max marks");
    }
    const existing = await ctx.db
      .query("marks")
      .withIndex("by_exam_and_student", (q) =>
        q.eq("examId", args.examId).eq("studentId", args.studentId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("marks", existing._id, {
        marksObtained: args.marksObtained,
        remarks: args.remarks?.trim(),
      });
      return existing._id;
    }
    return await ctx.db.insert("marks", {
      examId: args.examId,
      studentId: args.studentId,
      marksObtained: args.marksObtained,
      remarks: args.remarks?.trim(),
    });
  },
});
