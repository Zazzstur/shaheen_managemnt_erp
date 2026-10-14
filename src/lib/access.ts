export function isSchoolAdmin(user: {
  role: string;
  staffRole?: string;
}): boolean {
  return user.role === "super_admin" || user.staffRole === "data_entry";
}
