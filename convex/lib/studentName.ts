export function studentName(student: {
  fullName?: string;
  firstName?: string;
  lastName?: string;
}) {
  const fullName = student.fullName?.trim();
  if (fullName) {
    return fullName;
  }
  return `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim();
}
