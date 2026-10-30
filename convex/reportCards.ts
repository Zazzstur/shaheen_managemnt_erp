import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { isIsoDate, requireRoles, requireSchoolAdmin } from "./lib/auth";
import { studentName } from "./lib/studentName";

async function assertTeacherAssigned(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  classId: Id<"classes">,
  subjectId: Id<"subjects">,
) {
  if (user.role !== "teacher") {
    return;
  }
  const slots = await ctx.db
    .query("timetables")
    .withIndex("by_teacher", (q) => q.eq("teacherId", user._id))
    .take(200);
  const assigned = slots.some(
    (slot) => slot.classId === classId && slot.subjectId === subjectId,
  );
  if (!assigned) {
    throw new ConvexError(
      "Only the main teacher can enter marks for this class and subject",
    );
  }
}

const storedMarkValidator = v.union(v.number(), v.literal("AB"));

const reportLineValidator = v.object({
  subjectId: v.id("subjects"),
  subjectName: v.string(),
  marksObtained: storedMarkValidator,
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
        const stored = row.marksObtained;
        const value =
          incoming?.marksObtained ??
          (typeof stored === "number" ? stored : undefined);
        if (typeof value === "number" && value > args.maxMarks) {
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
  v.literal("notebook_1"),
  v.literal("enrichment_1"),
  v.literal("written_1"),
  v.literal("class_test_2"),
  v.literal("notebook_2"),
  v.literal("enrichment_2"),
  v.literal("written_2"),
);

// One class stores an exam per subject for every category below.
const categoryExamScan = 320;

// Older periodic exams are still titled "Class test 1/2".
// Written papers saved before this split are titled "Half yearly written"
// or "Annual written". Combined "Half yearly" / "Annual" rows are read below
// and are not renamed, so notebook and enrichment on those rows stay intact.
const categoryMeta = {
  class_test_1: {
    title: "Periodic test 1",
    legacyTitles: ["Class test 1"],
    maxMarks: 20,
  },
  notebook_1: {
    title: "Notebook 1",
    legacyTitles: [],
    maxMarks: 5,
  },
  enrichment_1: {
    title: "Subject enrichment 1",
    legacyTitles: [],
    maxMarks: 5,
  },
  written_1: {
    title: "Written 1",
    legacyTitles: ["Half yearly written"],
    maxMarks: 80,
  },
  class_test_2: {
    title: "Periodic test 2",
    legacyTitles: ["Class test 2"],
    maxMarks: 20,
  },
  notebook_2: {
    title: "Notebook 2",
    legacyTitles: [],
    maxMarks: 5,
  },
  enrichment_2: {
    title: "Subject enrichment 2",
    legacyTitles: [],
    maxMarks: 5,
  },
  written_2: {
    title: "Written 2",
    legacyTitles: ["Annual written"],
    maxMarks: 80,
  },
} as const;

const legacyTermMeta = {
  half: {
    title: "Half yearly",
    legacyTitles: ["Half-yearly"],
  },
  annual: {
    title: "Annual",
    legacyTitles: ["Annuals"],
  },
} as const;

type CategoryId = keyof typeof categoryMeta;
type ExamTitleMeta = {
  title: string;
  legacyTitles: readonly string[];
};
type LegacyPart = "written" | "notebook" | "enrichment";

const legacyRead: Partial<
  Record<CategoryId, { term: keyof typeof legacyTermMeta; part: LegacyPart }>
> = {
  notebook_1: { term: "half", part: "notebook" },
  enrichment_1: { term: "half", part: "enrichment" },
  written_1: { term: "half", part: "written" },
  notebook_2: { term: "annual", part: "notebook" },
  enrichment_2: { term: "annual", part: "enrichment" },
  written_2: { term: "annual", part: "written" },
};

function matchesCategory(examTitle: string, meta: ExamTitleMeta) {
  const normalized = examTitle.trim().toLowerCase();
  if (normalized === meta.title.toLowerCase()) {
    return true;
  }
  return meta.legacyTitles.some((title) => normalized === title.toLowerCase());
}

function pickCategoryExam<T extends { title: string }>(
  exams: T[],
  meta: ExamTitleMeta,
): T | undefined {
  const current = exams.find(
    (exam) => exam.title.trim().toLowerCase() === meta.title.toLowerCase(),
  );
  return current ?? exams.find((exam) => matchesCategory(exam.title, meta));
}

function assertStoredMark(
  value: number | "AB",
  max: number,
  message: string,
) {
  if (value === "AB") {
    return;
  }
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new ConvexError(message);
  }
}

function legacyWritten(mark: Doc<"marks"> | undefined): number | "AB" | undefined {
  // Older half-yearly and annual rows stored written and notebook together.
  // Enrichment-only rows leave notebookMarks unset; marksObtained is then only
  // a required placeholder, not the written paper.
  if (!mark || mark.notebookMarks === undefined) {
    return undefined;
  }
  return mark.marksObtained;
}

function legacyNotebook(mark: Doc<"marks"> | undefined): number | "AB" | undefined {
  if (!mark || mark.notebookMarks === undefined) {
    return undefined;
  }
  return mark.notebookMarks;
}

function resolveSeparate(
  examExists: boolean,
  dedicated: number | "AB" | undefined,
  legacy: number | "AB" | undefined,
): number | "AB" | null {
  if (examExists) {
    return dedicated ?? null;
  }
  return legacy ?? null;
}

function legacyPart(
  mark: Doc<"marks"> | undefined,
  part: LegacyPart,
): number | "AB" | undefined {
  if (part === "written") {
    return legacyWritten(mark);
  }
  if (part === "notebook") {
    return legacyNotebook(mark);
  }
  if (!mark || mark.enrichmentMarks === undefined) {
    return undefined;
  }
  return mark.enrichmentMarks;
}

const storedOrEmptyValidator = v.union(storedMarkValidator, v.null());

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
        classTest1: storedOrEmptyValidator,
        notebook1: storedOrEmptyValidator,
        enrichment1: storedOrEmptyValidator,
        written1: storedOrEmptyValidator,
        classTest2: storedOrEmptyValidator,
        notebook2: storedOrEmptyValidator,
        enrichment2: storedOrEmptyValidator,
        written2: storedOrEmptyValidator,
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireRoles(ctx, ["super_admin", "teacher"]);
    await assertTeacherAssigned(ctx, user, args.classId, args.subjectId);
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const exams = await ctx.db
      .query("exams")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(categoryExamScan);
    const subjectExams = exams.filter(
      (exam) => exam.subjectId === args.subjectId,
    );
    const students = await ctx.db
      .query("students")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(80);

    async function readPart(meta: ExamTitleMeta) {
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

    const dedicated = {
      class_test_1: await readPart(categoryMeta.class_test_1),
      notebook_1: await readPart(categoryMeta.notebook_1),
      enrichment_1: await readPart(categoryMeta.enrichment_1),
      written_1: await readPart(categoryMeta.written_1),
      class_test_2: await readPart(categoryMeta.class_test_2),
      notebook_2: await readPart(categoryMeta.notebook_2),
      enrichment_2: await readPart(categoryMeta.enrichment_2),
      written_2: await readPart(categoryMeta.written_2),
    };
    const halfYearly = await readPart(legacyTermMeta.half);
    const annual = await readPart(legacyTermMeta.annual);

    function cell(category: CategoryId, studentId: (typeof students)[number]["_id"]) {
      const source = legacyRead[category];
      const legacyMark = source
        ? (source.term === "half" ? halfYearly : annual)?.get(studentId)
        : undefined;
      return resolveSeparate(
        dedicated[category] !== null,
        dedicated[category]?.get(studentId)?.marksObtained,
        source ? legacyPart(legacyMark, source.part) : undefined,
      );
    }

    const rows = [];
    for (const student of students) {
      if (student.status !== "enrolled") {
        continue;
      }
      rows.push({
        studentId: student._id,
        studentName: studentName(student),
        classTest1: cell("class_test_1", student._id),
        notebook1: cell("notebook_1", student._id),
        enrichment1: cell("enrichment_1", student._id),
        written1: cell("written_1", student._id),
        classTest2: cell("class_test_2", student._id),
        notebook2: cell("notebook_2", student._id),
        enrichment2: cell("enrichment_2", student._id),
        written2: cell("written_2", student._id),
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
        cleared: v.optional(v.boolean()),
        marksObtained: v.optional(storedMarkValidator),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRoles(ctx, ["teacher"]);
    await assertTeacherAssigned(ctx, user, args.classId, args.subjectId);
    if (!isIsoDate(args.date)) {
      throw new ConvexError("Report date must be YYYY-MM-DD");
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
      if (mark.cleared) {
        continue;
      }
      const name = studentName(student);
      if (mark.marksObtained === undefined) {
        throw new ConvexError("Enter a mark or leave the field empty to clear it");
      }
      assertStoredMark(
        mark.marksObtained,
        meta.maxMarks,
        `${name}: marks must be between 0 and ${meta.maxMarks}, or AB`,
      );
    }

    const exams = await ctx.db
      .query("exams")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(categoryExamScan);
    const subjectExams = exams.filter(
      (item) => item.subjectId === args.subjectId,
    );
    const existingExam = pickCategoryExam(subjectExams, meta);
    const legacy = legacyRead[args.category];
    const legacyExam = legacy
      ? pickCategoryExam(subjectExams, legacyTermMeta[legacy.term])
      : undefined;
    const hasMarksToSave = args.marks.some((mark) => !mark.cleared);
    const hideLegacy =
      legacyExam !== undefined &&
      args.marks.length > 0 &&
      args.marks.every((mark) => mark.cleared === true);
    if (!existingExam && !hasMarksToSave && !hideLegacy) {
      return null;
    }
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
      if (mark.cleared) {
        if (existing) {
          await ctx.db.delete("marks", existing._id);
        }
        continue;
      }
      if (mark.marksObtained === undefined) {
        throw new ConvexError("Enter a mark or leave the field empty to clear it");
      }
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

const printCellValidator = v.union(v.number(), v.literal("AB"), v.null());

const printLineValidator = v.object({
  subjectId: v.id("subjects"),
  subjectName: v.string(),
  total: printCellValidator,
  maxMarks: v.number(),
});

export const printableReport = query({
  args: {
    classId: v.id("classes"),
    category: reportCategoryValidator,
  },
  returns: v.object({
    classLabel: v.string(),
    categoryTitle: v.string(),
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
    await requireSchoolAdmin(ctx);
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const meta = categoryMeta[args.category];
    const legacy = legacyRead[args.category];
    const exams = await ctx.db
      .query("exams")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .take(categoryExamScan);

    function examsBySubject(target: ExamTitleMeta) {
      const bySubject = new Map<
        (typeof exams)[number]["subjectId"],
        (typeof exams)[number]
      >();
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
    const legacyExamBySubject = legacy
      ? examsBySubject(legacyTermMeta[legacy.term])
      : new Map<
          (typeof exams)[number]["subjectId"],
          (typeof exams)[number]
        >();

    const subjectIds = [
      ...new Set([
        ...categoryExamBySubject.keys(),
        ...legacyExamBySubject.keys(),
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

    async function marksBySubject(
      bySubject: ReturnType<typeof examsBySubject>,
    ) {
      const result = new Map<
        string,
        NonNullable<Awaited<ReturnType<typeof marksFor>>>
      >();
      for (const [subjectId, exam] of bySubject) {
        const marks = await marksFor(exam._id);
        if (marks) {
          result.set(subjectId, marks);
        }
      }
      return result;
    }

    const categoryMarks = await marksBySubject(categoryExamBySubject);
    const legacyMarks = await marksBySubject(legacyExamBySubject);

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
        const legacyRow = legacyMarks.get(subjectId)?.get(student._id);
        const total = resolveSeparate(
          categoryExamBySubject.has(subjectId),
          mark?.marksObtained,
          legacy ? legacyPart(legacyRow, legacy.part) : undefined,
        );
        if (total === null) {
          continue;
        }
        lines.push({
          subjectId,
          subjectName: subjectNames.get(subjectId) ?? "Unknown subject",
          total,
          maxMarks: meta.maxMarks,
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
      students: rows,
    };
  },
});
