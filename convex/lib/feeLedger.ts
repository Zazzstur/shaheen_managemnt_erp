const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type FeeCoverage =
  | "paid"
  | "partial"
  | "due"
  | "upcoming"
  | "advance";

export type FeeMonthLine = {
  month: string;
  label: string;
  charge: number;
  applied: number;
  balance: number;
  coverage: FeeCoverage;
};

export type FeeAccount = {
  monthlyRate: number;
  chargedToDate: number;
  paid: number;
  due: number;
  advance: number;
  yearTotal: number;
  priorDue: number;
  months: FeeMonthLine[];
};

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function monthLabel(month: string) {
  const [year, rawMonth] = month.split("-");
  const index = Number(rawMonth) - 1;
  const name = MONTH_NAMES[index] ?? month;
  return `${name} ${year ?? ""}`.trim();
}

export function monthKeyFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

export function scheduleStartYear(academicYear: string, viewYear: number) {
  const match = academicYear.match(/(\d{4})/);
  const parsed = match ? Number(match[1]) : viewYear;
  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 2100) {
    return viewYear;
  }
  return Math.min(parsed, viewYear);
}

export function buildFeeAccount(args: {
  monthlyRate: number;
  paid: number;
  fromMonth: string;
  throughMonth: string;
  asOfMonth: string;
  displayYear: number;
}): FeeAccount {
  const monthlyRate = roundMoney(Math.max(0, args.monthlyRate));
  const paid = roundMoney(Math.max(0, args.paid));
  const months: FeeMonthLine[] = [];
  let pool = paid;
  let chargedToDate = 0;
  let yearTotal = 0;
  let priorUnpaid = 0;

  const [fromYear, fromMonth] = args.fromMonth.split("-").map(Number);
  const [throughYear, throughMonth] = args.throughMonth.split("-").map(Number);
  if (!fromYear || !fromMonth || !throughYear || !throughMonth) {
    return {
      monthlyRate,
      chargedToDate: 0,
      paid,
      due: 0,
      advance: paid,
      yearTotal: 0,
      priorDue: 0,
      months: [],
    };
  }

  let year = fromYear;
  let month = fromMonth;
  while (year < throughYear || (year === throughYear && month <= throughMonth)) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const inWindow = key >= args.fromMonth && key <= args.throughMonth;
    if (inWindow && monthlyRate > 0) {
      const open = key <= args.asOfMonth;
      const applied = roundMoney(Math.min(monthlyRate, pool));
      pool = roundMoney(pool - applied);
      const balance = roundMoney(monthlyRate - applied);
      if (open) {
        chargedToDate = roundMoney(chargedToDate + monthlyRate);
        if (year < args.displayYear) {
          priorUnpaid = roundMoney(priorUnpaid + balance);
        }
      }
      if (year === args.displayYear) {
        yearTotal = roundMoney(yearTotal + monthlyRate);
        months.push({
          month: key,
          label: monthLabel(key),
          charge: monthlyRate,
          applied,
          balance,
          coverage: coverageFor(open, monthlyRate, applied, balance),
        });
      }
    } else if (inWindow && year === args.displayYear) {
      yearTotal = roundMoney(yearTotal + monthlyRate);
      months.push({
        month: key,
        label: monthLabel(key),
        charge: 0,
        applied: 0,
        balance: 0,
        coverage: key <= args.asOfMonth ? "paid" : "upcoming",
      });
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  const due = roundMoney(Math.max(0, chargedToDate - paid));
  const advance = roundMoney(Math.max(0, paid - chargedToDate));

  return {
    monthlyRate,
    chargedToDate,
    paid,
    due,
    advance,
    yearTotal,
    priorDue: priorUnpaid,
    months,
  };
}

function coverageFor(
  open: boolean,
  charge: number,
  applied: number,
  balance: number,
): FeeCoverage {
  if (!open) {
    return applied > 0 ? "advance" : "upcoming";
  }
  if (charge <= 0 || balance <= 0) {
    return "paid";
  }
  if (applied > 0) {
    return "partial";
  }
  return "due";
}
