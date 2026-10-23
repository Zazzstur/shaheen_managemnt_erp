export function isSchoolAdmin(user: {
  role: string;
  staffRole?: string;
}): boolean {
  return user.role === "super_admin" || user.staffRole === "data_entry";
}

export function canOpenNavItem(
  item: {
    roles: readonly string[];
    staffRoles?: readonly string[];
    alsoStaffRoles?: readonly string[];
  },
  role: string,
  staffRole?: string,
) {
  if (item.staffRoles && role === "teacher") {
    return item.staffRoles.includes(staffRole ?? "");
  }
  if (item.roles.includes(role)) {
    return true;
  }
  return item.alsoStaffRoles?.includes(staffRole ?? "") ?? false;
}
