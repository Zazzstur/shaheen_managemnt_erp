export function isSchoolAdmin(user: {
  role: string;
  staffRole?: string;
}): boolean {
  return user.role === "super_admin" || user.staffRole === "data_entry";
}

export function canViewSchoolAdmin(user: {
  role: string;
  staffRole?: string;
}): boolean {
  return isSchoolAdmin(user) || user.staffRole === "observer";
}

const OFFICE_PREFIXES = [
  "/transport",
  "/fuel",
  "/admin/users",
  "/admin/staff",
  "/admin/fees",
  "/stock",
  "/expenses",
  "/cash-flow",
];

export function isOfficePath(pathname: string) {
  return OFFICE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function canOpenNavItem(
  item: {
    href?: string;
    roles: readonly string[];
    staffRoles?: readonly string[];
    alsoStaffRoles?: readonly string[];
  },
  role: string,
  staffRole?: string,
) {
  if (
    staffRole === "data_entry" &&
    item.href !== undefined &&
    isOfficePath(item.href)
  ) {
    return false;
  }
  if (staffRole === "observer") {
    return item.roles.includes("super_admin");
  }
  if (item.staffRoles && role === "teacher") {
    return item.staffRoles.includes(staffRole ?? "");
  }
  if (item.roles.includes(role)) {
    return true;
  }
  return item.alsoStaffRoles?.includes(staffRole ?? "") ?? false;
}
