import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import {
  getCurrentUser,
  isIsoDate,
  rejectObserver,
  requireClassTeacherForClass,
  requireSchoolAdmin,
  requireSchoolViewer,
} from "./lib/auth";
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

async function enrolledRoster(
  ctx: QueryCtx,
  classId: Id<"classes">,
  date: string,
) {
  const students = await ctx.db
    .query("students")
    .withIndex("by_class", (q) => q.eq("classId", classId))
    .take(80);
  const roster = [];
  for (const student of students) {
    if (student.status !== "enrolled") {
      continue;
    }
    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_student_and_date", (q) =>
        q.eq("studentId", student._id).eq("date", date),
      )
      .unique();
    roster.push({
      studentId: student._id,
      admissionNumber: student.admissionNumber,
      name: studentName(student),
      status: existing?.status ?? null,
    });
  }
  roster.sort((a, b) => a.name.localeCompare(b.name));
  return roster;
}

async function classTeacherFor(ctx: QueryCtx, classId: Id<"classes">) {
  const holders = await ctx.db
    .query("users")
    .withIndex("by_class", (q) => q.eq("classId", classId))
    .take(10);
  return holders.find((holder) => holder.staffRole === "class_teacher");
}

async function saveClassAttendance(
  ctx: MutationCtx,
  markerId: Id<"users">,
  classId: Id<"classes">,
  date: string,
  records: { studentId: Id<"students">; status: "present" | "absent" | "late" }[],
) {
  if (!isIsoDate(date)) {
    throw new Error("Date must be YYYY-MM-DD");
  }
  if (records.length === 0) {
    throw new Error("No attendance records provided");
  }
  if (records.length > 80) {
    throw new Error("Too many attendance records in one batch");
  }
  let saved = 0;
  for (const record of records) {
    const student = await ctx.db.get("students", record.studentId);
    if (!student || student.classId !== classId) {
      throw new Error("Student is not in the selected class");
    }
    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_student_and_date", (q) =>
        q.eq("studentId", record.studentId).eq("date", date),
      )
      .unique();
    if (existing) {
      await ctx.db.patch("attendance", existing._id, {
        status: record.status,
        markedBy: markerId,
      });
    } else {
      await ctx.db.insert("attendance", {
        studentId: record.studentId,
        date,
        status: record.status,
        markedBy: markerId,
      });
    }
    saved += 1;
  }
  return saved;
}

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
    return await enrolledRoster(ctx, args.classId, args.date);
  },
});

export const forClassDate = query({
  args: {
    classId: v.id("classes"),
    date: v.string(),
  },
  returns: v.object({
    classLabel: v.string(),
    classTeacherName: v.string(),
    classTeacherAbsent: v.boolean(),
    students: v.array(rosterItemValidator),
  }),
  handler: async (ctx, args) => {
    await requireSchoolViewer(ctx);
    if (!isIsoDate(args.date)) {
      throw new Error("Date must be YYYY-MM-DD");
    }
    const classroom = await ctx.db.get("classes", args.classId);
    if (!classroom) {
      throw new Error("Class not found");
    }
    const classTeacher = await classTeacherFor(ctx, args.classId);
    let classTeacherAbsent = false;
    if (classTeacher) {
      const absence = await ctx.db
        .query("teacherAbsences")
        .withIndex("by_date_and_teacher", (q) =>
          q.eq("date", args.date).eq("teacherId", classTeacher._id),
        )
        .unique();
      const staffMark = await ctx.db
        .query("staffAttendance")
        .withIndex("by_date_and_teacher", (q) =>
          q.eq("date", args.date).eq("teacherId", classTeacher._id),
        )
        .unique();
      classTeacherAbsent =
        absence !== null || staffMark?.status === "absent";
    }
    return {
      classLabel: `${classroom.name} ${classroom.section}`.trim(),
      classTeacherName:
        classTeacher?.name?.trim() ||
        classTeacher?.email?.trim() ||
        "No class teacher",
      classTeacherAbsent,
      students: await enrolledRoster(ctx, args.classId, args.date),
    };
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
    const saved = await saveClassAttendance(
      ctx,
      marker._id,
      args.classId,
      args.date,
      args.records,
    );
    return { saved };
  },
});

export const markForOffice = mutation({
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
    const marker = await requireSchoolAdmin(ctx);
    rejectObserver(marker);
    const saved = await saveClassAttendance(
      ctx,
      marker._id,
      args.classId,
      args.date,
      args.records,
    );
    return { saved };
  },
});
