import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getCurrentUser, rejectObserver } from "./lib/auth";
import { studentName } from "./lib/studentName";
import { slotsTaughtBy } from "./lib/timetableAssistants";

export const MONTHLY_TEST_MAX = 20;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const storedMarkValidator = v.union(v.number(), v.literal("AB"));

const assignmentValidator = v.object({
  classId: v.id("classes"),
  classLabel: v.string(),
  subjectId: v.id("subjects"),
  subjectName: v.string(),
});

function classLabel(classroom: { name: string; section: string }) {
  return `${classroom.name} ${classroom.section}`.trim();
}

function canViewOfficeRecord(user: { role: string; staffRole?: string }) {
  if (user.staffRole === "data_entry") {
    return false;
  }
  return user.role === "super_admin" || user.staffRole === "observer";
}

function currentIstMonthIndex(now = Date.now()) {
  const ist = new Date(now + IST_OFFSET_MS);
  return ist.getUTCFullYear() * 12 + ist.getUTCMonth();
}

function parseMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new ConvexError("Choose a test month");
  }
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  if (year < 2000 || year > 2100) {
    throw new ConvexError("Choose a test month");
  }
  return year * 12 + (monthNumber - 1);
}

function assertPastTestMonth(month: string) {
  const value = parseMonth(month);
  if (value >= currentIstMonthIndex()) {
    throw new ConvexError(
      "This month's test is entered next month. Choose an earlier month.",
    );
  }
}

async function requireMonthlyTestUser(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (user.role === "super_admin") {
    return user;
  }
  if (
    user.role === "teacher" &&
    user.staffRole !== "driver" &&
    user.staffRole !== "staff"
  ) {
    return user;
  }
  throw new Error("Unauthorized: insufficient role");
}

async function subjectsOnClass(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
) {
  const slots = await ctx.db
    .query("timetables")
    .withIndex("by_class", (q) => q.eq("classId", classId))
    .take(80);
  const seen = new Set<string>();
  const subjects = [];
  for (const slot of slots) {
    if (seen.has(slot.subjectId)) {
      continue;
    }
    seen.add(slot.subjectId);
    const subject = await ctx.db.get("subjects", slot.subjectId);
    if (!subject) {
      continue;
    }
    subjects.push({ subjectId: subject._id, subjectName: subject.name });
  }
  subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  return subjects;
}

async function assignmentsFromSlots(
  ctx: QueryCtx | MutationCtx,
  slots: Doc<"timetables">[],
) {
  const seen = new Set<string>();
  const result = [];
  for (const slot of slots) {
    const key = `${slot.classId}:${slot.subjectId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const classroom = await ctx.db.get("classes", slot.classId);
    const subject = await ctx.db.get("subjects", slot.subjectId);
    if (!classroom || !subject) {
      continue;
    }
    result.push({
      classId: slot.classId,
      classLabel: classLabel(classroom),
      subjectId: slot.subjectId,
      subjectName: subject.name,
    });
  }
  result.sort(
    (a, b) =>
      a.classLabel.localeCompare(b.classLabel) ||
      a.subjectName.localeCompare(b.subjectName),
  );
  return result;
}

async function teachesSubject(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  classId: Id<"classes">,
  subjectId: Id<"subjects">,
) {
  const slots = await slotsTaughtBy(ctx, userId);
  return slots.some(
    (slot) => slot.classId === classId && slot.subjectId === subjectId,
  );
}

async function assertCanEnter(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  classId: Id<"classes">,
  subjectId: Id<"subjects">,
) {
  rejectObserver(user);
  const classroom = await ctx.db.get("classes", classId);
  if (!classroom) {
    throw new ConvexError("Class not found");
  }
  const subject = await ctx.db.get("subjects", subjectId);
  if (!subject) {
    throw new ConvexError("Subject not found");
  }
  const onClass = (await subjectsOnClass(ctx, classId)).some(
    (item) => item.subjectId === subjectId,
  );
  if (!onClass) {
    throw new ConvexError("This subject is not on the class timetable");
  }
  if (user.role === "super_admin" && user.staffRole !== "data_entry") {
    return { classroom, subject };
  }
  if (await teachesSubject(ctx, user._id, classId, subjectId)) {
    return { classroom, subject };
  }
  throw new ConvexError("You can enter marks only for subjects you teach");
}

async function enrolledStudents(ctx: QueryCtx | MutationCtx, classId: Id<"classes">) {
  const students = await ctx.db
    .query("students")
    .withIndex("by_class", (q) => q.eq("classId", classId))
    .take(80);
  return students
    .filter((student) => student.status === "enrolled")
    .sort((a, b) => studentName(a).localeCompare(studentName(b)));
}

function assertStoredMark(value: number | "AB", studentLabel: string) {
  if (value === "AB") {
    return;
  }
  if (!Number.isFinite(value) || value < 0 || value > MONTHLY_TEST_MAX) {
    throw new ConvexError(
      `${studentLabel}: marks must be between 0 and ${MONTHLY_TEST_MAX}, or AB`,
    );
  }
}

export const entryOptions = query({
  args: {},
  returns: v.array(assignmentValidator),
  handler: async (ctx) => {
    const user = await requireMonthlyTestUser(ctx);
    if (
      user.staffRole !== "data_entry" &&
      (user.role === "super_admin" || user.staffRole === "observer")
    ) {
      return [];
    }
    return await assignmentsFromSlots(
      ctx,
      await slotsTaughtBy(ctx, user._id),
    );
  },
});

export const sheet = query({
  args: {
    classId: v.id("classes"),
    subjectId: v.id("subjects"),
    month: v.string(),
  },
  returns: v.object({
    classLabel: v.string(),
    subjectName: v.string(),
    maxMarks: v.number(),
    students: v.array(
      v.object({
        studentId: v.id("students"),
        studentName: v.string(),
        admissionNumber: v.string(),
        marksObtained: v.union(storedMarkValidator, v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireMonthlyTestUser(ctx);
    parseMonth(args.month);
    const { classroom, subject } = await assertCanEnter(
      ctx,
      user,
      args.classId,
      args.subjectId,
    );
    const test = await ctx.db
      .query("monthlyTests")
      .withIndex("by_class_subject_and_month", (q) =>
        q
          .eq("classId", args.classId)
          .eq("subjectId", args.subjectId)
          .eq("month", args.month),
      )
      .unique();
    const markRows = test
      ? await ctx.db
          .query("monthlyTestMarks")
          .withIndex("by_test", (q) => q.eq("testId", test._id))
          .take(80)
      : [];
    const marks = new Map(markRows.map((row) => [row.studentId, row.marksObtained]));
    const students = await enrolledStudents(ctx, args.classId);
    return {
      classLabel: classLabel(classroom),
      subjectName: subject.name,
      maxMarks: MONTHLY_TEST_MAX,
      students: students.map((student) => ({
        studentId: student._id,
        studentName: studentName(student),
        admissionNumber: student.admissionNumber,
        marksObtained: marks.get(student._id) ?? null,
      })),
    };
  },
});

export const save = mutation({
  args: {
    classId: v.id("classes"),
    subjectId: v.id("subjects"),
    month: v.string(),
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
    const user = await requireMonthlyTestUser(ctx);
    assertPastTestMonth(args.month);
    await assertCanEnter(ctx, user, args.classId, args.subjectId);
    if (args.marks.length > 80) {
      throw new ConvexError("Too many students in one save");
    }
    const seen = new Set<string>();
    for (const mark of args.marks) {
      if (seen.has(mark.studentId)) {
        throw new ConvexError("Each student can only be saved once");
      }
      seen.add(mark.studentId);
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
      if (mark.marksObtained === undefined) {
        throw new ConvexError("Enter a mark or leave the field empty to clear it");
      }
      assertStoredMark(mark.marksObtained, studentName(student));
    }

    const existing = await ctx.db
      .query("monthlyTests")
      .withIndex("by_class_subject_and_month", (q) =>
        q
          .eq("classId", args.classId)
          .eq("subjectId", args.subjectId)
          .eq("month", args.month),
      )
      .unique();
    const hasMarks = args.marks.some((mark) => !mark.cleared);
    if (!existing && !hasMarks) {
      return null;
    }
    const testId = existing
      ? existing._id
      : await ctx.db.insert("monthlyTests", {
          classId: args.classId,
          subjectId: args.subjectId,
          month: args.month,
          maxMarks: MONTHLY_TEST_MAX,
        });
    if (existing && existing.maxMarks !== MONTHLY_TEST_MAX) {
      await ctx.db.patch("monthlyTests", testId, { maxMarks: MONTHLY_TEST_MAX });
    }

    for (const mark of args.marks) {
      const row = await ctx.db
        .query("monthlyTestMarks")
        .withIndex("by_test_and_student", (q) =>
          q.eq("testId", testId).eq("studentId", mark.studentId),
        )
        .unique();
      if (mark.cleared) {
        if (row) {
          await ctx.db.delete("monthlyTestMarks", row._id);
        }
        continue;
      }
      if (mark.marksObtained === undefined) {
        throw new ConvexError("Enter a mark or leave the field empty to clear it");
      }
      if (row) {
        await ctx.db.patch("monthlyTestMarks", row._id, {
          marksObtained: mark.marksObtained,
        });
      } else {
        await ctx.db.insert("monthlyTestMarks", {
          testId,
          studentId: mark.studentId,
          marksObtained: mark.marksObtained,
        });
      }
    }
    return null;
  },
});

const classOptionValidator = v.object({
  classId: v.id("classes"),
  classLabel: v.string(),
});

export const recordClasses = query({
  args: {},
  returns: v.array(classOptionValidator),
  handler: async (ctx) => {
    const user = await requireMonthlyTestUser(ctx);
    if (!canViewOfficeRecord(user)) {
      throw new Error("Unauthorized: insufficient role");
    }
    const classes = await ctx.db.query("classes").take(100);
    return classes
      .map((classroom) => ({
        classId: classroom._id,
        classLabel: classLabel(classroom),
      }))
      .sort((a, b) => a.classLabel.localeCompare(b.classLabel));
  },
});

export const record = query({
  args: {
    classId: v.id("classes"),
    month: v.string(),
  },
  returns: v.object({
    classLabel: v.string(),
    maxMarks: v.number(),
    subjects: v.array(
      v.object({
        subjectId: v.id("subjects"),
        subjectName: v.string(),
      }),
    ),
    students: v.array(
      v.object({
        studentId: v.id("students"),
        studentName: v.string(),
        admissionNumber: v.string(),
        marks: v.array(v.union(storedMarkValidator, v.null())),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireMonthlyTestUser(ctx);
    if (!canViewOfficeRecord(user)) {
      throw new Error("Unauthorized: insufficient role");
    }
    parseMonth(args.month);
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new ConvexError("Class not found");
    }
    const subjects = await subjectsOnClass(ctx, args.classId);
    const tests = await ctx.db
      .query("monthlyTests")
      .withIndex("by_class_and_month", (q) =>
        q.eq("classId", args.classId).eq("month", args.month),
      )
      .take(40);
    const marksBySubject = new Map<Id<"subjects">, Map<Id<"students">, number | "AB">>();
    for (const test of tests) {
      const rows = await ctx.db
        .query("monthlyTestMarks")
        .withIndex("by_test", (q) => q.eq("testId", test._id))
        .take(80);
      marksBySubject.set(
        test.subjectId,
        new Map(rows.map((row) => [row.studentId, row.marksObtained])),
      );
    }
    const students = await enrolledStudents(ctx, args.classId);
    return {
      classLabel: classLabel(classroom),
      maxMarks: MONTHLY_TEST_MAX,
      subjects,
      students: students.map((student) => ({
        studentId: student._id,
        studentName: studentName(student),
        admissionNumber: student.admissionNumber,
        marks: subjects.map(
          (subject) => marksBySubject.get(subject.subjectId)?.get(student._id) ?? null,
        ),
      })),
    };
  },
});

const HISTORY_MARK_LIMIT = 1000;

export const studentHistory = query({
  args: {
    studentId: v.id("students"),
  },
  returns: v.object({
    studentName: v.string(),
    admissionNumber: v.string(),
    maxMarks: v.number(),
    months: v.array(
      v.object({
        month: v.string(),
        rows: v.array(
          v.object({
            classLabel: v.string(),
            subjectName: v.string(),
            marksObtained: storedMarkValidator,
          }),
        ),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireMonthlyTestUser(ctx);
    if (!canViewOfficeRecord(user)) {
      throw new Error("Unauthorized: insufficient role");
    }
    const student = await ctx.db.get("students", args.studentId);
    if (!student) {
      throw new ConvexError("Student not found");
    }
    const marks = await ctx.db
      .query("monthlyTestMarks")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .take(HISTORY_MARK_LIMIT);
    const tests = new Map<string, Doc<"monthlyTests"> | null>();
    const classes = new Map<string, Doc<"classes"> | null>();
    const subjects = new Map<string, Doc<"subjects"> | null>();
    const grouped = new Map<
      string,
      { classLabel: string; subjectName: string; marksObtained: number | "AB" }[]
    >();
    for (const mark of marks) {
      let test = tests.get(mark.testId);
      if (test === undefined) {
        test = await ctx.db.get("monthlyTests", mark.testId);
        tests.set(mark.testId, test);
      }
      if (!test) {
        continue;
      }
      let classroom = classes.get(test.classId);
      if (classroom === undefined) {
        classroom = await ctx.db.get("classes", test.classId);
        classes.set(test.classId, classroom);
      }
      let subject = subjects.get(test.subjectId);
      if (subject === undefined) {
        subject = await ctx.db.get("subjects", test.subjectId);
        subjects.set(test.subjectId, subject);
      }
      if (!classroom || !subject) {
        continue;
      }
      const rows = grouped.get(test.month) ?? [];
      rows.push({
        classLabel: classLabel(classroom),
        subjectName: subject.name,
        marksObtained: mark.marksObtained,
      });
      grouped.set(test.month, rows);
    }
    const months = [...grouped.entries()]
      .sort((left, right) => (left[0] < right[0] ? 1 : left[0] > right[0] ? -1 : 0))
      .map(([month, rows]) => ({
        month,
        rows: rows.sort(
          (left, right) =>
            left.classLabel.localeCompare(right.classLabel) ||
            left.subjectName.localeCompare(right.subjectName),
        ),
      }));
    return {
      studentName: studentName(student),
      admissionNumber: student.admissionNumber,
      maxMarks: MONTHLY_TEST_MAX,
      months,
    };
  },
});
