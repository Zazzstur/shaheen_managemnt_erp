import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRoles, requireSuperAdmin } from "./lib/auth";
import { studentName } from "./lib/studentName";

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
    await requireRoles(ctx, ["super_admin"]);
    const routes = await ctx.db.query("transportRoutes").take(50);
    const rows = [];
    for (const route of routes) {
      const assigned = await ctx.db
        .query("studentTransport")
        .withIndex("by_route", (q) => q.eq("routeId", route._id))
        .take(80);
      rows.push({
        ...route,
        assignedCount: assigned.length,
      });
    }
    return rows;
  },
});

export const listAssignmentsForRoute = query({
  args: { routeId: v.id("transportRoutes") },
  returns: v.array(assignmentRowValidator),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin"]);
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
      if (!student) {
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
  },
  returns: v.array(studentTransportRowValidator),
  handler: async (ctx, args) => {
    await requireRoles(ctx, ["super_admin"]);
    const students = await ctx.db.query("students").take(80);
    const rows = [];
    for (const student of students) {
      if (student.status !== "enrolled") {
        continue;
      }
      const classroom = await ctx.db.get("classes", student.classId);
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
        classLabel: classroom
          ? `${classroom.name} ${classroom.section}`.trim()
          : "Unassigned",
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
    await requireSuperAdmin(ctx);
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
    await requireSuperAdmin(ctx);
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
    await requireSuperAdmin(ctx);
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
    await requireSuperAdmin(ctx);
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
    await requireSuperAdmin(ctx);
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
    await requireSuperAdmin(ctx);
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
