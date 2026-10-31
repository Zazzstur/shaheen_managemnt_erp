import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireSchoolAdmin } from "./lib/auth";
import { studentName } from "./lib/studentName";

const MAX_SEARCH_LENGTH = 100;

function normalizeSearchTerm(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, MAX_SEARCH_LENGTH);
}

function matchesEnrolledSearch(student: Doc<"students">, term: string) {
  if (student.status !== "enrolled") {
    return false;
  }
  if (!term) {
    return true;
  }
  const name = studentName(student).toLowerCase().replace(/\s+/g, " ").trim();
  const admission = student.admissionNumber.toLowerCase().replace(/\s+/g, "");
  const admissionTerm = term.replace(/ /g, "");
  return (
    name.includes(term) ||
    (admissionTerm.length > 0 && admission.includes(admissionTerm))
  );
}

async function enrolledStudentsForRoute(
  ctx: QueryCtx,
  routeId: Id<"transportRoutes">,
) {
  const route = await ctx.db.get("transportRoutes", routeId);
  if (!route) {
    throw new Error("Route not found");
  }
  const assignments = await ctx.db
    .query("studentTransport")
    .withIndex("by_route", (q) => q.eq("routeId", routeId))
    .collect();
  const students: Doc<"students">[] = [];
  for (const assignment of assignments) {
    const student = await ctx.db.get("students", assignment.studentId);
    if (student?.status === "enrolled") {
      students.push(student);
    }
  }
  return students;
}

const routeDocValidator = v.object({
  _id: v.id("transportRoutes"),
  _creationTime: v.number(),
  name: v.string(),
  driverName: v.string(),
  vehicleNumber: v.string(),
  defaultFee: v.number(),
  status: v.union(v.literal("active"), v.literal("inactive")),
  assignedCount: v.number(),
});

const assignmentRowValidator = v.object({
  _id: v.id("studentTransport"),
  studentId: v.id("students"),
  studentName: v.string(),
  admissionNumber: v.string(),
  stopName: v.optional(v.string()),
  customFee: v.optional(v.number()),
  effectiveFee: v.number(),
});

const studentTransportRowValidator = v.object({
  studentId: v.id("students"),
  studentName: v.string(),
  admissionNumber: v.string(),
  classLabel: v.string(),
  assignmentId: v.optional(v.id("studentTransport")),
  routeId: v.optional(v.id("transportRoutes")),
  routeName: v.optional(v.string()),
  stopName: v.optional(v.string()),
  defaultFee: v.optional(v.number()),
  customFee: v.optional(v.number()),
  effectiveFee: v.optional(v.number()),
  hasCustomFee: v.boolean(),
});

export const listRoutes = query({
  args: {},
  returns: v.array(routeDocValidator),
  handler: async (ctx) => {
    await requireSchoolAdmin(ctx);
    const routes = await ctx.db.query("transportRoutes").take(50);
    const rows = [];
    for (const route of routes) {
      const assigned = await ctx.db
        .query("studentTransport")
        .withIndex("by_route", (q) => q.eq("routeId", route._id))
        .take(80);
      let assignedCount = 0;
      for (const assignment of assigned) {
        const student = await ctx.db.get("students", assignment.studentId);
        if (student?.status === "enrolled") {
          assignedCount += 1;
        }
      }
      rows.push({
        ...route,
        assignedCount,
      });
    }
    return rows;
  },
});

export const listAssignmentsForRoute = query({
  args: { routeId: v.id("transportRoutes") },
  returns: v.array(assignmentRowValidator),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const route = await ctx.db.get("transportRoutes", args.routeId);
    if (!route) {
      throw new Error("Route not found");
    }
    const assignments = await ctx.db
      .query("studentTransport")
      .withIndex("by_route", (q) => q.eq("routeId", args.routeId))
      .take(80);
    const rows = [];
    for (const assignment of assignments) {
      const student = await ctx.db.get("students", assignment.studentId);
      if (!student || student.status !== "enrolled") {
        continue;
      }
      rows.push({
        _id: assignment._id,
        studentId: student._id,
        studentName: studentName(student),
        admissionNumber: student.admissionNumber,
        stopName: assignment.stopName,
        customFee: assignment.customFee,
        effectiveFee: assignment.customFee ?? route.defaultFee,
      });
    }
    return rows;
  },
});

export const listStudentRows = query({
  args: {
    routeId: v.optional(v.id("transportRoutes")),
    customFeeOnly: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  returns: v.array(studentTransportRowValidator),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const term = normalizeSearchTerm(args.search);
    if (!term && !args.routeId) {
      return [];
    }
    const students = term
      ? (await ctx.db.query("students").collect()).filter((student) =>
          matchesEnrolledSearch(student, term),
        )
      : await enrolledStudentsForRoute(ctx, args.routeId!);
    const classLabels = new Map<Id<"classes">, string>();
    const rows = [];
    for (const student of students) {
      if (!matchesEnrolledSearch(student, term)) {
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
      const assignment = await ctx.db
        .query("studentTransport")
        .withIndex("by_student", (q) => q.eq("studentId", student._id))
        .unique();
      const route = assignment
        ? await ctx.db.get("transportRoutes", assignment.routeId)
        : null;
      if (args.routeId && assignment?.routeId !== args.routeId) {
        continue;
      }
      const hasCustomFee = assignment?.customFee !== undefined;
      if (args.customFeeOnly && !hasCustomFee) {
        continue;
      }
      rows.push({
        studentId: student._id,
        studentName: studentName(student),
        admissionNumber: student.admissionNumber,
        classLabel,
        assignmentId: assignment?._id,
        routeId: assignment?.routeId,
        routeName: route?.name,
        stopName: assignment?.stopName,
        defaultFee: route?.defaultFee,
        customFee: assignment?.customFee,
        effectiveFee: assignment
          ? (assignment.customFee ?? route?.defaultFee)
          : undefined,
        hasCustomFee,
      });
    }
    rows.sort(
      (left, right) =>
        left.studentName.localeCompare(right.studentName) ||
        left.admissionNumber.localeCompare(right.admissionNumber, undefined, {
          numeric: true,
        }),
    );
    return rows;
  },
});

export const createRoute = mutation({
  args: {
    name: v.string(),
    driverName: v.string(),
    vehicleNumber: v.string(),
    defaultFee: v.number(),
  },
  returns: v.id("transportRoutes"),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const name = args.name.trim();
    const driverName = args.driverName.trim();
    const vehicleNumber = args.vehicleNumber.trim();
    if (!name || !driverName || !vehicleNumber) {
      throw new Error("Route name, driver, and vehicle number are required");
    }
    if (!Number.isFinite(args.defaultFee) || args.defaultFee <= 0) {
      throw new Error("Default route fee must be greater than 0");
    }
    return await ctx.db.insert("transportRoutes", {
      name,
      driverName,
      vehicleNumber,
      defaultFee: args.defaultFee,
      status: "active",
    });
  },
});

export const updateRoute = mutation({
  args: {
    routeId: v.id("transportRoutes"),
    name: v.string(),
    driverName: v.string(),
    vehicleNumber: v.string(),
    defaultFee: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const route = await ctx.db.get("transportRoutes", args.routeId);
    if (!route) {
      throw new Error("Route not found");
    }
    if (!Number.isFinite(args.defaultFee) || args.defaultFee <= 0) {
      throw new Error("Default route fee must be greater than 0");
    }
    await ctx.db.patch("transportRoutes", args.routeId, {
      name: args.name.trim(),
      driverName: args.driverName.trim(),
      vehicleNumber: args.vehicleNumber.trim(),
      defaultFee: args.defaultFee,
      status: args.status,
    });
    return null;
  },
});

export const assignStudent = mutation({
  args: {
    studentId: v.id("students"),
    routeId: v.id("transportRoutes"),
    stopName: v.optional(v.string()),
    customFee: v.optional(v.number()),
  },
  returns: v.id("studentTransport"),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const student = await ctx.db.get("students", args.studentId);
    if (!student || student.status !== "enrolled") {
      throw new Error("Student not found");
    }
    const route = await ctx.db.get("transportRoutes", args.routeId);
    if (!route) {
      throw new Error("Route not found");
    }
    if (
      args.customFee !== undefined &&
      (!Number.isFinite(args.customFee) || args.customFee < 0)
    ) {
      throw new Error("Custom fee must be zero or greater");
    }
    const existing = await ctx.db
      .query("studentTransport")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .unique();
    const payload = {
      studentId: args.studentId,
      routeId: args.routeId,
      stopName: args.stopName?.trim() || undefined,
      customFee: args.customFee,
    };
    if (existing) {
      await ctx.db.patch("studentTransport", existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("studentTransport", payload);
  },
});

export const setCustomFee = mutation({
  args: {
    studentId: v.id("students"),
    customFee: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const existing = await ctx.db
      .query("studentTransport")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .unique();
    if (!existing) {
      throw new Error("Assign a route before setting a custom fee");
    }
    if (
      args.customFee !== null &&
      (!Number.isFinite(args.customFee) || args.customFee < 0)
    ) {
      throw new Error("Custom fee must be zero or greater");
    }
    await ctx.db.patch("studentTransport", existing._id, {
      customFee: args.customFee === null ? undefined : args.customFee,
    });
    return null;
  },
});

export const setStop = mutation({
  args: {
    studentId: v.id("students"),
    stopName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const existing = await ctx.db
      .query("studentTransport")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .unique();
    if (!existing) {
      throw new Error("Assign a route before setting a stop");
    }
    const stopName = args.stopName.trim();
    await ctx.db.patch("studentTransport", existing._id, {
      stopName: stopName || undefined,
    });
    return null;
  },
});

export const unassignStudent = mutation({
  args: { studentId: v.id("students") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const existing = await ctx.db
      .query("studentTransport")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .unique();
    if (existing) {
      await ctx.db.delete("studentTransport", existing._id);
    }
    return null;
  },
});
