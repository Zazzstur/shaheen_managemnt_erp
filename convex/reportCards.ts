import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isIsoDate, requireRoles } from "./lib/auth";
import { studentName } from "./lib/studentName";

const reportLineValidator = v.object({
  subjectId: v.id("subjects"),
  subjectName: v.string(),
  marksObtained: v.number(),
  maxMarks: v.number(),
  remarks: v.optional(v.string()),
});

const studentReportValidator = v.object({
  studentId: v.id("students"),
  studentName: v.string(),
  admissionNumber: v.string(),
  guardianName: v.optional(v.string()),
  attendanceMarked: v.number(),
  attendancePresent: v.number(),
  attendancePercent: v.union(v.number(), v.null()),
  lines: v.array(reportLineValidator),
});

export const forClass = query({
  args: {
    classId: v.id("classes"),
    title: v.string(),
  },
  returns: v.object({
    classLabel: v.string(),
    students: v.array(studentReportValidator),
  }),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin", "teacher"]);
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const title = args.title.trim().toLowerCase();
    const exams = await ctx.db
      .query("exams")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);
    const termExams = title
      ? exams.filter((exam) => exam.title.trim().toLowerCase() === title)
      : [];
    const subjects = new Map<string, string>();
    for (const exam of termExams) {
      const subject = await ctx.db.get("subjects", exam.subjectId);
      subjects.set(exam.subjectId, subject?.name ?? "Unknown subject");
    }

    const students = await ctx.db
      .query("students")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);

    const rows = [];
    for (const student of students) {
      if (student.status !== "enrolled") {
        continue;
      }
      const lines = [];
      for (const exam of termExams) {
        const mark = await ctx.db
          .query("marks")
          .withIndex("by_exam_and_student", (q) =>
            q.eq("examId", exam._id).eq("studentId", student._id),
          )
          .unique();
        if (!mark) {
          continue;
        }
        lines.push({
          subjectId: exam.subjectId,
          subjectName: subjects.get(exam.subjectId) ?? "Unknown subject",
          marksObtained: mark.marksObtained,
          maxMarks: exam.maxMarks,
          remarks: mark.remarks,
        });
      }
      const attendance = await ctx.db
        .query("attendance")
        .withIndex("by_student", (q) => q.eq("studentId", student._id))
        .take(120);
      const attendancePresent = attendance.filter(
        (row) => row.status === "present" || row.status === "late",
      ).length;
      rows.push({
        studentId: student._id,
        studentName: studentName(student),
        admissionNumber: student.admissionNumber,
        guardianName: student.guardianName,
        attendanceMarked: attendance.length,
        attendancePresent,
        attendancePercent:
          attendance.length === 0
            ? null
            : Math.round((attendancePresent / attendance.length) * 100),
        lines,
      });
    }
    rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
    return {
      classLabel: `${classroom.name} ${classroom.section}`.trim(),
      students: rows,
    };
  },
});

export const saveLine = mutation({
  args: {
    classId: v.id("classes"),
    title: v.string(),
    date: v.string(),
    subjectId: v.id("subjects"),
    studentId: v.id("students"),
    marksObtained: v.number(),
    maxMarks: v.number(),
    remarks: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["teacher"]);
    const title = args.title.trim();
    if (!title) {
      throw new Error("Report title is required");
    }
    if (!isIsoDate(args.date)) {
      throw new Error("Report date must be YYYY-MM-DD");
    }
    if (!Number.isFinite(args.maxMarks) || args.maxMarks <= 0) {
      throw new Error("Max marks must be greater than 0");
    }
    if (
      !Number.isFinite(args.marksObtained) ||
      args.marksObtained < 0 ||
      args.marksObtained > args.maxMarks
    ) {
      throw new Error("Marks must be between 0 and max marks");
    }
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const subject = await ctx.db.get("subjects", args.subjectId);
    if (!subject) {
      throw new Error("Subject not found");
    }
    const student = await ctx.db.get("students", args.studentId);
    if (!student || student.classId !== args.classId || student.status !== "enrolled") {
      throw new Error("Student is not enrolled in this class");
    }

    const exams = await ctx.db
      .query("exams")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);
    const existingExam = exams.find(
      (item) =>
        item.subjectId === args.subjectId &&
        item.title.trim().toLowerCase() === title.toLowerCase(),
    );
    const examId = existingExam
      ? existingExam._id
      : await ctx.db.insert("exams", {
          title,
          classId: args.classId,
          subjectId: args.subjectId,
          date: args.date,
          maxMarks: args.maxMarks,
        });
    const exam = existingExam ?? (await ctx.db.get("exams", examId));
    if (!exam) {
      throw new Error("Could not save this subject");
    }
    if (args.marksObtained > exam.maxMarks) {
      throw new Error(`Marks cannot exceed ${exam.maxMarks} for this subject`);
    }

    const existing = await ctx.db
      .query("marks")
      .withIndex("by_exam_and_student", (q) =>
        q.eq("examId", exam._id).eq("studentId", args.studentId),
      )
      .unique();
    const remarks = args.remarks?.trim() || undefined;
    if (existing) {
      await ctx.db.patch("marks", existing._id, {
        marksObtained: args.marksObtained,
        remarks,
      });
    } else {
      await ctx.db.insert("marks", {
        examId: exam._id,
        studentId: args.studentId,
        marksObtained: args.marksObtained,
        remarks,
      });
    }
    return null;
  },
});

export const saveSubjectMarks = mutation({
  args: {
    classId: v.id("classes"),
    title: v.string(),
    date: v.string(),
    subjectId: v.id("subjects"),
    maxMarks: v.number(),
    marks: v.array(
      v.object({
        studentId: v.id("students"),
        marksObtained: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["teacher"]);
    const title = args.title.trim();
    if (!title) {
      throw new Error("Report title is required");
    }
    if (!isIsoDate(args.date)) {
      throw new Error("Report date must be YYYY-MM-DD");
    }
    if (!Number.isFinite(args.maxMarks) || args.maxMarks <= 0) {
      throw new Error("Max marks must be greater than 0");
    }
    if (args.marks.length === 0) {
      throw new Error("Enter marks for at least one student");
    }
    if (args.marks.length > 80) {
      throw new Error("Too many students in one save");
    }
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const subject = await ctx.db.get("subjects", args.subjectId);
    if (!subject) {
      throw new Error("Subject not found");
    }
    for (const mark of args.marks) {
      if (
        !Number.isFinite(mark.marksObtained) ||
        mark.marksObtained < 0 ||
        mark.marksObtained > args.maxMarks
      ) {
        throw new Error("Each mark must be between 0 and the max marks");
      }
      const student = await ctx.db.get("students", mark.studentId);
      if (
        !student ||
        student.classId !== args.classId ||
        student.status !== "enrolled"
      ) {
        throw new Error("Student is not enrolled in this class");
      }
    }

    const exams = await ctx.db
      .query("exams")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);
    const existingExam = exams.find(
      (item) =>
        item.subjectId === args.subjectId &&
        item.title.trim().toLowerCase() === title.toLowerCase(),
    );
    const examId = existingExam
      ? existingExam._id
      : await ctx.db.insert("exams", {
          title,
          classId: args.classId,
          subjectId: args.subjectId,
          date: args.date,
          maxMarks: args.maxMarks,
        });
    if (existingExam && existingExam.maxMarks !== args.maxMarks) {
      const stored = await ctx.db
        .query("marks")
        .withIndex("by_exam", (q) => q.eq("examId", existingExam._id))
        .take(80);
      for (const row of stored) {
        const incoming = args.marks.find(
          (mark) => mark.studentId === row.studentId,
        );
        const value = incoming?.marksObtained ?? row.marksObtained;
        if (value > args.maxMarks) {
          throw new Error("Max marks is lower than a mark already saved");
        }
      }
      await ctx.db.patch("exams", examId, { maxMarks: args.maxMarks });
    }

    for (const mark of args.marks) {
      const existing = await ctx.db
        .query("marks")
        .withIndex("by_exam_and_student", (q) =>
          q.eq("examId", examId).eq("studentId", mark.studentId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("marks", existing._id, {
          marksObtained: mark.marksObtained,
        });
      } else {
        await ctx.db.insert("marks", {
          examId,
          studentId: mark.studentId,
          marksObtained: mark.marksObtained,
        });
      }
    }
    return null;
  },
});

const reportCategoryValidator = v.union(
  v.literal("class_test_1"),
  v.literal("half_yearly"),
  v.literal("class_test_2"),
  v.literal("annual"),
);

// Exams saved before the rename are still titled "Class test 1/2".
const categoryMeta = {
  class_test_1: {
    title: "Periodic test 1",
    legacyTitles: ["Class test 1"],
    maxMarks: 20,
    composite: false,
  },
  half_yearly: {
    title: "Half yearly",
    legacyTitles: [],
    maxMarks: 80,
    composite: true,
  },
  class_test_2: {
    title: "Periodic test 2",
    legacyTitles: ["Class test 2"],
    maxMarks: 20,
    composite: false,
  },
  annual: { title: "Annual", legacyTitles: [], maxMarks: 80, composite: true },
} as const;

type CategoryMeta = (typeof categoryMeta)[keyof typeof categoryMeta];

function matchesCategory(examTitle: string, meta: CategoryMeta) {
  const normalized = examTitle.trim().toLowerCase();
  if (normalized === meta.title.toLowerCase()) {
    return true;
  }
  return meta.legacyTitles.some((title) => normalized === title.toLowerCase());
}

function pickCategoryExam<T extends { title: string }>(
  exams: T[],
  meta: CategoryMeta,
): T | undefined {
  const current = exams.find(
    (exam) => exam.title.trim().toLowerCase() === meta.title.toLowerCase(),
  );
  return current ?? exams.find((exam) => matchesCategory(exam.title, meta));
}

const partValidator = v.union(
  v.object({
    written: v.number(),
    notebook: v.number(),
    enrichment: v.number(),
  }),
  v.null(),
);

export const categorySheet = query({
  args: {
    classId: v.id("classes"),
    subjectId: v.id("subjects"),
  },
  returns: v.object({
    classLabel: v.string(),
    students: v.array(
      v.object({
        studentId: v.id("students"),
        studentName: v.string(),
        classTest1: v.union(v.number(), v.null()),
        classTest2: v.union(v.number(), v.null()),
        halfYearly: partValidator,
        annual: partValidator,
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin", "teacher"]);
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const exams = await ctx.db
      .query("exams")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);
    const subjectExams = exams.filter(
      (exam) => exam.subjectId === args.subjectId,
    );
    const students = await ctx.db
      .query("students")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);

    async function readPart(meta: CategoryMeta) {
      const exam = pickCategoryExam(subjectExams, meta);
      if (!exam) {
        return null;
      }
      const rows = await ctx.db
        .query("marks")
        .withIndex("by_exam", (q) => q.eq("examId", exam._id))
        .take(80);
      return new Map(rows.map((row) => [row.studentId, row]));
    }

    const classTest1 = await readPart(categoryMeta.class_test_1);
    const classTest2 = await readPart(categoryMeta.class_test_2);
    const halfYearly = await readPart(categoryMeta.half_yearly);
    const annual = await readPart(categoryMeta.annual);

    const rows = [];
    for (const student of students) {
      if (student.status !== "enrolled") {
        continue;
      }
      const half = halfYearly?.get(student._id);
      const year = annual?.get(student._id);
      rows.push({
        studentId: student._id,
        studentName: studentName(student),
        classTest1: classTest1?.get(student._id)?.marksObtained ?? null,
        classTest2: classTest2?.get(student._id)?.marksObtained ?? null,
        halfYearly: half
          ? {
              written: half.marksObtained,
              notebook: half.notebookMarks ?? 0,
              enrichment: half.enrichmentMarks ?? 0,
            }
          : null,
        annual: year
          ? {
              written: year.marksObtained,
              notebook: year.notebookMarks ?? 0,
              enrichment: year.enrichmentMarks ?? 0,
            }
          : null,
      });
    }
    rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
    return {
      classLabel: `${classroom.name} ${classroom.section}`.trim(),
      students: rows,
    };
  },
});

export const saveCategoryMarks = mutation({
  args: {
    classId: v.id("classes"),
    subjectId: v.id("subjects"),
    date: v.string(),
    category: reportCategoryValidator,
    marks: v.array(
      v.object({
        studentId: v.id("students"),
        marksObtained: v.number(),
        notebookMarks: v.optional(v.number()),
        enrichmentMarks: v.optional(v.number()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["teacher"]);
    if (!isIsoDate(args.date)) {
      throw new ConvexError("Report date must be YYYY-MM-DD");
    }
    if (args.marks.length === 0) {
      throw new ConvexError("Enter marks for at least one student");
    }
    if (args.marks.length > 80) {
      throw new ConvexError("Too many students in one save");
    }
    const meta = categoryMeta[args.category];
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new ConvexError("Class not found");
    }
    const subject = await ctx.db.get("subjects", args.subjectId);
    if (!subject) {
      throw new ConvexError("Subject not found");
    }
    for (const mark of args.marks) {
      const student = await ctx.db.get("students", mark.studentId);
      if (
        !student ||
        student.classId !== args.classId ||
        student.status !== "enrolled"
      ) {
        throw new ConvexError("Student is not enrolled in this class");
      }
      const name = studentName(student);
      if (
        !Number.isFinite(mark.marksObtained) ||
        mark.marksObtained < 0 ||
        mark.marksObtained > meta.maxMarks
      ) {
        throw new ConvexError(
          meta.composite
            ? `${name}: written marks must be between 0 and 80`
            : `${name}: marks must be between 0 and 20`,
        );
      }
      if (meta.composite) {
        const notebook = mark.notebookMarks ?? 0;
        const enrichment = mark.enrichmentMarks ?? 0;
        if (!Number.isFinite(notebook) || notebook < 0 || notebook > 5) {
          throw new ConvexError(
            `${name}: notebook marks must be between 0 and 5`,
          );
        }
        if (!Number.isFinite(enrichment) || enrichment < 0 || enrichment > 5) {
          throw new ConvexError(
            `${name}: subject enrichment marks must be between 0 and 5`,
          );
        }
      }
    }

    const exams = await ctx.db
      .query("exams")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);
    const existingExam = pickCategoryExam(
      exams.filter((item) => item.subjectId === args.subjectId),
      meta,
    );
    const examId = existingExam
      ? existingExam._id
      : await ctx.db.insert("exams", {
          title: meta.title,
          classId: args.classId,
          subjectId: args.subjectId,
          date: args.date,
          maxMarks: meta.maxMarks,
        });
    if (
      existingExam &&
      (existingExam.maxMarks !== meta.maxMarks ||
        existingExam.title !== meta.title)
    ) {
      await ctx.db.patch("exams", examId, {
        title: meta.title,
        maxMarks: meta.maxMarks,
      });
    }

    for (const mark of args.marks) {
      const existing = await ctx.db
        .query("marks")
        .withIndex("by_exam_and_student", (q) =>
          q.eq("examId", examId).eq("studentId", mark.studentId),
        )
        .unique();
      const patch = meta.composite
        ? {
            marksObtained: mark.marksObtained,
            notebookMarks: mark.notebookMarks ?? 0,
            enrichmentMarks: mark.enrichmentMarks ?? 0,
          }
        : { marksObtained: mark.marksObtained };
      if (existing) {
        await ctx.db.patch("marks", existing._id, patch);
      } else {
        await ctx.db.insert("marks", {
          examId,
          studentId: mark.studentId,
          ...patch,
        });
      }
    }
    return null;
  },
});

const printLineValidator = v.object({
  subjectId: v.id("subjects"),
  subjectName: v.string(),
  total: v.union(v.number(), v.null()),
  maxMarks: v.number(),
  written: v.union(v.number(), v.null()),
  notebook: v.union(v.number(), v.null()),
  enrichment: v.union(v.number(), v.null()),
  classTestHalf: v.union(v.number(), v.null()),
});

export const printableReport = query({
  args: {
    classId: v.id("classes"),
    category: reportCategoryValidator,
  },
  returns: v.object({
    classLabel: v.string(),
    categoryTitle: v.string(),
    composite: v.boolean(),
    students: v.array(
      v.object({
        studentId: v.id("students"),
        studentName: v.string(),
        admissionNumber: v.string(),
        guardianName: v.optional(v.string()),
        attendanceMarked: v.number(),
        attendancePresent: v.number(),
        attendancePercent: v.union(v.number(), v.null()),
        lines: v.array(printLineValidator),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin"]);
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const meta = categoryMeta[args.category];
    const linkedMeta =
      args.category === "half_yearly"
        ? categoryMeta.class_test_1
        : args.category === "annual"
          ? categoryMeta.class_test_2
          : null;
    const exams = await ctx.db
      .query("exams")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);

    function examsBySubject(target: CategoryMeta | null) {
      const bySubject = new Map<
        (typeof exams)[number]["subjectId"],
        (typeof exams)[number]
      >();
      if (!target) {
        return bySubject;
      }
      const subjectIds = new Set(
        exams
          .filter((exam) => matchesCategory(exam.title, target))
          .map((exam) => exam.subjectId),
      );
      for (const subjectId of subjectIds) {
        const exam = pickCategoryExam(
          exams.filter((item) => item.subjectId === subjectId),
          target,
        );
        if (exam) {
          bySubject.set(subjectId, exam);
        }
      }
      return bySubject;
    }

    const categoryExamBySubject = examsBySubject(meta);
    const linkedExamBySubject = examsBySubject(linkedMeta);

    const subjectIds = [
      ...new Set([
        ...categoryExamBySubject.keys(),
        ...linkedExamBySubject.keys(),
      ]),
    ];
    const subjectNames = new Map<string, string>();
    for (const subjectId of subjectIds) {
      const subject = await ctx.db.get("subjects", subjectId);
      subjectNames.set(subjectId, subject?.name ?? "Unknown subject");
    }

    async function marksFor(examId: (typeof exams)[number]["_id"] | undefined) {
      if (!examId) {
        return null;
      }
      const rows = await ctx.db
        .query("marks")
        .withIndex("by_exam", (q) => q.eq("examId", examId))
        .take(80);
      return new Map(rows.map((row) => [row.studentId, row]));
    }

    const categoryMarks = new Map<
      string,
      NonNullable<Awaited<ReturnType<typeof marksFor>>>
    >();
    for (const [subjectId, exam] of categoryExamBySubject) {
      const marks = await marksFor(exam._id);
      if (marks) {
        categoryMarks.set(subjectId, marks);
      }
    }
    const linkedMarks = new Map<
      string,
      NonNullable<Awaited<ReturnType<typeof marksFor>>>
    >();
    for (const [subjectId, exam] of linkedExamBySubject) {
      const marks = await marksFor(exam._id);
      if (marks) {
        linkedMarks.set(subjectId, marks);
      }
    }

    const students = await ctx.db
      .query("students")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);
    const rows = [];
    for (const student of students) {
      if (student.status !== "enrolled") {
        continue;
      }
      const lines = [];
      for (const subjectId of subjectIds) {
        const mark = categoryMarks.get(subjectId)?.get(student._id);
        const linked = linkedMarks.get(subjectId)?.get(student._id);
        const classTestHalf =
          linked === undefined ? null : linked.marksObtained / 2;
        if (!meta.composite) {
          lines.push({
            subjectId,
            subjectName: subjectNames.get(subjectId) ?? "Unknown subject",
            total: mark ? mark.marksObtained : null,
            maxMarks: 20,
            written: null,
            notebook: null,
            enrichment: null,
            classTestHalf: null,
          });
          continue;
        }
        const written = mark ? mark.marksObtained : null;
        const notebook = mark ? (mark.notebookMarks ?? 0) : null;
        const enrichment = mark ? (mark.enrichmentMarks ?? 0) : null;
        lines.push({
          subjectId,
          subjectName: subjectNames.get(subjectId) ?? "Unknown subject",
          total:
            written === null
              ? null
              : written +
                (notebook ?? 0) +
                (enrichment ?? 0) +
                (classTestHalf ?? 0),
          maxMarks: 100,
          written,
          notebook,
          enrichment,
          classTestHalf,
        });
      }
      lines.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
      const attendance = await ctx.db
        .query("attendance")
        .withIndex("by_student", (q) => q.eq("studentId", student._id))
        .take(120);
      const attendancePresent = attendance.filter(
        (row) => row.status === "present" || row.status === "late",
      ).length;
      rows.push({
        studentId: student._id,
        studentName: studentName(student),
        admissionNumber: student.admissionNumber,
        guardianName: student.guardianName,
        attendanceMarked: attendance.length,
        attendancePresent,
        attendancePercent:
          attendance.length === 0
            ? null
            : Math.round((attendancePresent / attendance.length) * 100),
        lines,
      });
    }
    rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
    return {
      classLabel: `${classroom.name} ${classroom.section}`.trim(),
      categoryTitle: meta.title,
      composite: meta.composite,
      students: rows,
    };
  },
});
