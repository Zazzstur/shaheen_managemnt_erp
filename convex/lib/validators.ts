import { v } from "convex/values";

export const userRoleValidator = v.union(
  v.literal("super_admin"),
  v.literal("teacher"),
  v.literal("student"),
  v.literal("parent"),
);

export const userStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("suspended"),
);

export const genderValidator = v.union(
  v.literal("female"),
  v.literal("male"),
  v.literal("other"),
);

export const socialCategoryValidator = v.union(
  v.literal("general"),
  v.literal("obc"),
  v.literal("sc"),
  v.literal("st"),
);

export const schoolAffiliationValidator = v.union(
  v.literal("state"),
  v.literal("cbse"),
  v.literal("icse"),
  v.literal("other"),
);

export const studentStatusValidator = v.union(
  v.literal("enrolled"),
  v.literal("withdrawn"),
);

export const attendanceStatusValidator = v.union(
  v.literal("present"),
  v.literal("absent"),
  v.literal("late"),
);

export const dayOfWeekValidator = v.union(
  v.literal("monday"),
  v.literal("tuesday"),
  v.literal("wednesday"),
  v.literal("thursday"),
  v.literal("friday"),
  v.literal("saturday"),
);

export const tuitionCycleValidator = v.union(
  v.literal("monthly"),
  v.literal("annual"),
);

export const discountTypeValidator = v.union(
  v.literal("percent"),
  v.literal("amount"),
);

export const extraFeeValidator = v.object({
  label: v.string(),
  amount: v.number(),
});

export const feeStatusValidator = v.union(
  v.literal("pending"),
  v.literal("paid"),
  v.literal("partial"),
);

export const userDocValidator = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
  role: userRoleValidator,
  status: userStatusValidator,
});

export const classDocValidator = v.object({
  _id: v.id("classes"),
  _creationTime: v.number(),
  name: v.string(),
  section: v.string(),
  academicYear: v.string(),
  tuitionCycle: v.optional(tuitionCycleValidator),
  baseTuitionFee: v.optional(v.number()),
  extraFees: v.optional(v.array(extraFeeValidator)),
});

export const classAdminRowValidator = v.object({
  _id: v.id("classes"),
  _creationTime: v.number(),
  name: v.string(),
  section: v.string(),
  academicYear: v.string(),
  tuitionCycle: tuitionCycleValidator,
  baseTuitionFee: v.number(),
  extraFees: v.array(extraFeeValidator),
  enrolledCount: v.number(),
  totalClassFee: v.number(),
});

export const subjectDocValidator = v.object({
  _id: v.id("subjects"),
  _creationTime: v.number(),
  name: v.string(),
  code: v.string(),
});

export const studentListItemValidator = v.object({
  _id: v.id("students"),
  _creationTime: v.number(),
  admissionNumber: v.string(),
  fullName: v.optional(v.string()),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  name: v.string(),
  dateOfBirth: v.string(),
  gender: genderValidator,
  classId: v.id("classes"),
  classLabel: v.string(),
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
  discountType: v.optional(discountTypeValidator),
  discountValue: v.optional(v.number()),
  discountReason: v.optional(v.string()),
  admissionDate: v.optional(v.string()),
});

export const feeListItemValidator = v.object({
  _id: v.id("fees"),
  _creationTime: v.number(),
  studentId: v.id("students"),
  studentName: v.string(),
  admissionNumber: v.string(),
  amount: v.number(),
  dueDate: v.string(),
  status: feeStatusValidator,
  invoiceNumber: v.string(),
  paidAmount: v.optional(v.number()),
  notes: v.optional(v.string()),
  lastPaymentAt: v.optional(v.number()),
});
