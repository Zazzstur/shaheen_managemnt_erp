import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRoles, requireSuperAdmin } from "./lib/auth";
import { classDocValidator, subjectDocValidator } from "./lib/validators";

export const listClasses = query({
  args: {},
  returns: v.array(classDocValidator),
  handler: async (ctx) => {
    await requireRoles(ctx, ["super_admin", "teacher", "student", "parent"]);
    return await ctx.db.query("classes").take(100);
  },
});

export const createClass = mutation({
  args: {
    name: v.string(),
    section: v.string(),
    academicYear: v.string(),
  },
  returns: v.id("classes"),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const name = args.name.trim();
    const section = args.section.trim();
    const academicYear = args.academicYear.trim();
    if (!name || !section || !academicYear) {
      throw new Error("Class name, section, and academic year are required");
    }
    return await ctx.db.insert("classes", { name, section, academicYear });
  },
});

export const listSubjects = query({
  args: {},
  returns: v.array(subjectDocValidator),
  handler: async (ctx) => {
    await requireRoles(ctx, ["super_admin", "teacher", "student", "parent"]);
    return await ctx.db.query("subjects").take(100);
  },
});

function subjectCodeFromName(name: string, usedCodes: Set<string>): string {
  const base = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "SUB";
  let code = base;
  let suffix = 2;
  while (usedCodes.has(code)) {
    code = `${base}${suffix}`;
    suffix += 1;
  }
  return code;
}

export const createSubject = mutation({
  args: {
    name: v.string(),
    code: v.string(),
  },
  returns: v.id("subjects"),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const name = args.name.trim();
    const code = args.code.trim().toUpperCase();
    if (!name || !code) {
      throw new Error("Subject name and code are required");
    }
    const existing = await ctx.db
      .query("subjects")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (existing) {
      throw new Error("Subject code already exists");
    }
    return await ctx.db.insert("subjects", { name, code });
  },
});

export const createOrGetByName = mutation({
  args: { name: v.string() },
  returns: v.id("subjects"),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const name = args.name.trim();
    if (!name) {
      throw new Error("Subject name is required");
    }
    const subjects = await ctx.db.query("subjects").take(100);
    const existing = subjects.find(
      (subject) => subject.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      return existing._id;
    }
    const code = subjectCodeFromName(
      name,
      new Set(subjects.map((subject) => subject.code)),
    );
    return await ctx.db.insert("subjects", { name, code });
  },
});

export const seedDefaults = mutation({
  args: {},
  returns: v.object({ classCount: v.number(), subjectCount: v.number() }),
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const existingClasses = await ctx.db.query("classes").take(1);
    if (existingClasses.length === 0) {
      await ctx.db.insert("classes", {
        name: "Grade 10",
        section: "A",
        academicYear: "2026-2027",
        tuitionCycle: "monthly",
        baseTuitionFee: 15000,
        extraFees: [],
      });
      await ctx.db.insert("classes", {
        name: "Grade 10",
        section: "B",
        academicYear: "2026-2027",
        tuitionCycle: "monthly",
        baseTuitionFee: 15000,
        extraFees: [],
      });
    }
    const existingSubjects = await ctx.db.query("subjects").take(1);
    if (existingSubjects.length === 0) {
      await ctx.db.insert("subjects", { name: "Mathematics", code: "MATH" });
      await ctx.db.insert("subjects", { name: "English", code: "ENG" });
      await ctx.db.insert("subjects", { name: "Science", code: "SCI" });
    }
    const classes = await ctx.db.query("classes").take(100);
    const subjects = await ctx.db.query("subjects").take(100);
    return { classCount: classes.length, subjectCount: subjects.length };
  },
});
