import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  attendanceStatusValidator,
  dayOfWeekValidator,
  feeStatusValidator,
  genderValidator,
  schoolAffiliationValidator,
  socialCategoryValidator,
  studentStatusValidator,
  userRoleValidator,
  userStatusValidator,
} from "./lib/validators";

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: userRoleValidator,
    status: userStatusValidator,
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_role", ["role"]),

  classes: defineTable({
    name: v.string(),
    section: v.string(),
    academicYear: v.string(),
    tuitionCycle: v.optional(v.union(v.literal("monthly"), v.literal("annual"))),
    baseTuitionFee: v.optional(v.number()),
    extraFees: v.optional(
      v.array(
        v.object({
          label: v.string(),
          amount: v.number(),
        }),
      ),
    ),
  }).index("by_name_and_section", ["name", "section"]),

  subjects: defineTable({
    name: v.string(),
    code: v.string(),
  }).index("by_code", ["code"]),

  students: defineTable({
    admissionNumber: v.string(),
    fullName: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    dateOfBirth: v.string(),
    gender: genderValidator,
    classId: v.id("classes"),
    guardianUserId: v.optional(v.id("users")),
    guardianName: v.optional(v.string()),
    guardianPhone: v.optional(v.string()),
    aadhaarNumber: v.optional(v.string()),
    placeOfBirth: v.optional(v.string()),
    religion: v.optional(v.string()),
    caste: v.optional(v.string()),
    motherTongue: v.optional(v.string()),
    socialCategory: v.optional(socialCategoryValidator),
    motherName: v.optional(v.string()),
    fatherAadhaarNumber: v.optional(v.string()),
    motherAadhaarNumber: v.optional(v.string()),
    motherPhone: v.optional(v.string()),
    email: v.optional(v.string()),
    residentialAddress: v.optional(v.string()),
    transportRequired: v.optional(v.boolean()),
    previousSchoolAffiliation: v.optional(schoolAffiliationValidator),
    previousSchoolOther: v.optional(v.string()),
    previousSchoolName: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    status: studentStatusValidator,
    discountType: v.optional(v.union(v.literal("percent"), v.literal("amount"))),
    discountValue: v.optional(v.number()),
    discountReason: v.optional(v.string()),
    admissionDate: v.optional(v.string()),
  })
    .index("by_admission_number", ["admissionNumber"])
    .index("by_class", ["classId"])
    .index("by_guardian", ["guardianUserId"])
    .index("by_user", ["userId"]),

  attendance: defineTable({
    studentId: v.id("students"),
    date: v.string(),
    status: attendanceStatusValidator,
    markedBy: v.id("users"),
  })
    .index("by_student_and_date", ["studentId", "date"])
    .index("by_date", ["date"])
    .index("by_student", ["studentId"]),

  timetables: defineTable({
    classId: v.id("classes"),
    dayOfWeek: dayOfWeekValidator,
    periodNumber: v.number(),
    subjectId: v.id("subjects"),
    teacherId: v.optional(v.id("users")),
  })
    .index("by_class", ["classId"])
    .index("by_class_day_period", ["classId", "dayOfWeek", "periodNumber"])
    .index("by_teacher", ["teacherId"]),

  fees: defineTable({
    studentId: v.id("students"),
    amount: v.number(),
    dueDate: v.string(),
    status: feeStatusValidator,
    invoiceNumber: v.string(),
    paidAmount: v.optional(v.number()),
    notes: v.optional(v.string()),
    lastPaymentAt: v.optional(v.number()),
  })
    .index("by_student", ["studentId"])
    .index("by_invoice_number", ["invoiceNumber"])
    .index("by_status", ["status"]),

  feePayments: defineTable({
    studentId: v.id("students"),
    kind: v.union(v.literal("academic"), v.literal("transport")),
    amount: v.number(),
    paidOn: v.string(),
    note: v.optional(v.string()),
  }).index("by_student", ["studentId"]),

  exams: defineTable({
    title: v.string(),
    classId: v.id("classes"),
    subjectId: v.id("subjects"),
    date: v.string(),
    maxMarks: v.number(),
  })
    .index("by_class", ["classId"])
    .index("by_subject", ["subjectId"]),

  marks: defineTable({
    examId: v.id("exams"),
    studentId: v.id("students"),
    marksObtained: v.number(),
    remarks: v.optional(v.string()),
    notebookMarks: v.optional(v.number()),
    enrichmentMarks: v.optional(v.number()),
  })
    .index("by_exam", ["examId"])
    .index("by_student", ["studentId"])
    .index("by_exam_and_student", ["examId", "studentId"]),

  transportRoutes: defineTable({
    name: v.string(),
    driverName: v.string(),
    vehicleNumber: v.string(),
    defaultFee: v.number(),
    status: v.union(v.literal("active"), v.literal("inactive")),
  }).index("by_status", ["status"]),

  studentTransport: defineTable({
    studentId: v.id("students"),
    routeId: v.id("transportRoutes"),
    stopName: v.optional(v.string()),
    customFee: v.optional(v.number()),
  })
    .index("by_student", ["studentId"])
    .index("by_route", ["routeId"]),
});
