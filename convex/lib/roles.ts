export const USER_ROLES = [
  "super_admin",
  "teacher",
  "student",
  "parent",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const SIGNUP_ROLES = ["teacher", "student", "parent"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export function isSignupRole(value: unknown): value is SignupRole {
  return (
    value === "teacher" || value === "student" || value === "parent"
  );
}
