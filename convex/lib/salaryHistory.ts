export type SalaryRate = {
  effectiveMonth: string;
  monthlySalary: number;
};

/** Calendar month in India Standard Time (UTC+5:30), as YYYY-MM. */
export function indiaYearMonth(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .slice(0, 7);
}

export function salaryForMonth(
  month: string,
  rates: SalaryRate[],
  fallback?: number,
) {
  const ordered = [...rates].sort((left, right) =>
    left.effectiveMonth.localeCompare(right.effectiveMonth),
  );
  if (ordered.length === 0) {
    return fallback;
  }
  let chosen: number | undefined;
  for (const rate of ordered) {
    if (rate.effectiveMonth <= month) {
      chosen = rate.monthlySalary;
    }
  }
  return chosen ?? ordered[0].monthlySalary;
}

export function salaryMonths(joiningDate: string, asOf: string) {
  const start = joiningDate.slice(0, 7);
  const end = asOf.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end) || start > end) {
    return [];
  }
  const months: string[] = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function salarySchedule(
  joiningDate: string,
  asOf: string,
  rates: SalaryRate[],
  fallback?: number,
) {
  return salaryMonths(joiningDate, asOf).flatMap((month) => {
    const salary = salaryForMonth(month, rates, fallback);
    return salary === undefined ? [] : [{ month, salary }];
  });
}
