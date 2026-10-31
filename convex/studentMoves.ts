import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSchoolAdmin } from "./lib/auth";
import { parseFeeMonth } from "./lib/feeLedger";
import { studentName } from "./lib/studentName";

const SEARCH_LIMIT = 30;

const searchHitValidator = v.object({
  studentId: v.id("students"),
  studentName: v.string(),
  admissionNumber: v.string(),
  classId: v.id("classes"),
  classLabel: v.string(),
});

const classOptionValidator = v.object({
  _id: v.id("classes"),
  name: v.string(),
  section: v.string(),
  academicYear: v.string(),
});

function normalizeSearchTerm(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
}

function matchesEnrolled(
  student: {
    status: "enrolled" | "withdrawn";
    admissionNumber: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
  },
  term: string,
) {
  if (student.status !== "enrolled") {
    return false;
  }
  const name = studentName(student).toLowerCase().replace(/\s+/g, " ").trim();
  const admission = student.admissionNumber.toLowerCase().replace(/\s+/g, "");
  const admissionTerm = term.replace(/ /g, "");
  return (
    name.includes(term) ||
    (admissionTerm.length > 0 && admission.includes(admissionTerm))
  );
}

export const searchEnrolled = query({
  args: { term: v.string() },
  returns: v.object({
    students: v.array(searchHitValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const term = normalizeSearchTerm(args.term);
    if (term.length < 1) {
      return { students: [], truncated: false };
    }
    const students = await ctx.db.query("students").collect();
    const classLabels = new Map<string, string>();
    const hits = [];
    for (const student of students) {
      if (!matchesEnrolled(student, term)) {
        continue;
      }
      let classLabel = classLabels.get(student.classId);
      if (classLabel === undefined) {
        const classroom = await ctx.db.get("classes", student.classId);
        classLabel = classroom
          ? `${classroom.name} ${classroom.section}`.trim()
          : "Unassigned";
        classLabels.set(student.classId, classLabel);
      }
      hits.push({
        studentId: student._id,
        studentName: studentName(student),
        admissionNumber: student.admissionNumber,
        classId: student.classId,
        classLabel,
      });
    }
    hits.sort(
      (left, right) =>
        left.studentName.localeCompare(right.studentName) ||
        left.admissionNumber.localeCompare(right.admissionNumber, undefined, {
          numeric: true,
        }),
    );
    return {
      students: hits.slice(0, SEARCH_LIMIT),
      truncated: hits.length > SEARCH_LIMIT,
    };
  },
});

export const listClasses = query({
  args: {},
  returns: v.array(classOptionValidator),
  handler: async (ctx) => {
    await requireSchoolAdmin(ctx);
    const classes = await ctx.db.query("classes").collect();
    classes.sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.section.localeCompare(right.section) ||
        left.academicYear.localeCompare(right.academicYear),
    );
    return classes.map((classroom) => ({
      _id: classroom._id,
      name: classroom.name,
      section: classroom.section,
      academicYear: classroom.academicYear,
    }));
  },
});

export const changeClass = mutation({
  args: {
    studentId: v.id("students"),
    toClassId: v.id("classes"),
    effectiveMonth: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireSchoolAdmin(ctx);
    const effectiveMonth = parseFeeMonth(args.effectiveMonth);
    if (!effectiveMonth) {
      throw new Error("Month must be a real YYYY-MM inside a fee year");
    }
    const student = await ctx.db.get("students", args.studentId);
    if (!student || student.status !== "enrolled") {
      throw new Error("Student not found");
    }
    const nextClass = await ctx.db.get("classes", args.toClassId);
    if (!nextClass) {
      throw new Error("Class not found");
    }
    if (student.classId === nextClass._id) {
      throw new Error("Choose a different class");
    }
    const changes = await ctx.db
      .query("classChanges")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .collect();
    const latest = changes.reduce(
      (max, row) => (row.effectiveMonth > max ? row.effectiveMonth : max),
      "",
    );
    if (latest && effectiveMonth <= latest) {
      throw new Error(
        `Choose a month after the last class change (${latest})`,
      );
    }
    await ctx.db.insert("classChanges", {
      studentId: student._id,
      fromClassId: student.classId,
      toClassId: nextClass._id,
      effectiveMonth,
      changedBy: user._id,
    });
    await ctx.db.patch(student._id, { classId: nextClass._id });
    return null;
  },
});

export const withdraw = mutation({
  args: { studentId: v.id("students") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const student = await ctx.db.get("students", args.studentId);
    if (!student || student.status !== "enrolled") {
      throw new Error("Student not found");
    }
    await ctx.db.patch(student._id, { status: "withdrawn" });
    return null;
  },
});
