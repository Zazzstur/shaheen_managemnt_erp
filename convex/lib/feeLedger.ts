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
  /** Monthly fee before this collection discount. */
  charge: number;
  /** Collection discount deducted from this month. */
  discount: number;
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

export function academicFeeBreakdown(args: {
  baseTuitionFee: number | undefined;
  extraFees: { amount: number }[] | undefined;
  tuitionCycle: "monthly" | "annual" | undefined;
  discountType: "percent" | "amount" | undefined;
  discountValue: number | undefined;
}) {
  const tuition = args.baseTuitionFee ?? 0;
  const extras = (args.extraFees ?? []).reduce(
    (sum, fee) => sum + (fee.amount > 0 ? fee.amount : 0),
    0,
  );
  const cycleTotal = tuition + extras;
  const classMonthly = roundMoney(
    Math.max(0, args.tuitionCycle === "annual" ? cycleTotal / 12 : cycleTotal),
  );
  const value = args.discountValue ?? 0;
  if (value <= 0 || classMonthly <= 0) {
    return { classMonthly, discountAmount: 0, monthlyFee: classMonthly };
  }
  const raw =
    args.discountType === "percent" ? (classMonthly * value) / 100 : value;
  const discountAmount = roundMoney(Math.min(classMonthly, Math.max(0, raw)));
  return {
    classMonthly,
    discountAmount,
    monthlyFee: roundMoney(classMonthly - discountAmount),
  };
}

/** Fee year runs 1 April through 31 March. January–March belong to the year that started the previous April. */
export function feeYearStartYear(iso: string) {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  if (!Number.isFinite(year) || month < 1 || month > 12) {
    return year;
  }
  return month >= 4 ? year : year - 1;
}

export function feeYearLabel(startYear: number) {
  return `${startYear}-${startYear + 1}`;
}

export function feeYearStartIso(iso: string) {
  return `${feeYearStartYear(iso)}-04-01`;
}

export function feeYearRange(startYear: number) {
  return {
    fromMonth: `${startYear}-04`,
    throughMonth: `${startYear + 1}-03`,
  };
}

/** A real YYYY-MM that falls in a fee year (April–March), years 2000–2100. */
export function parseFeeMonth(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return null;
  }
  const year = Number(value.slice(0, 4));
  if (year < 2000 || year > 2100) {
    return null;
  }
  const start = feeYearStartYear(`${value}-01`);
  if (!Number.isFinite(start)) {
    return null;
  }
  const range = feeYearRange(start);
  if (value < range.fromMonth || value > range.throughMonth) {
    return null;
  }
  return value;
}

export function eachMonth(fromMonth: string, throughMonth: string) {
  const months: string[] = [];
  const [fromYear, fromPart] = fromMonth.split("-").map(Number);
  const [throughYear, throughPart] = throughMonth.split("-").map(Number);
  if (!fromYear || !fromPart || !throughYear || !throughPart) {
    return months;
  }
  let year = fromYear;
  let month = fromPart;
  while (year < throughYear || (year === throughYear && month <= throughPart)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (months.length > 240) {
      break;
    }
  }
  return months;
}

export function feeScheduleWindow(academicYear: string, asOf: string) {
  const feeYearStart = feeYearStartYear(asOf);
  const startYear = scheduleStartYear(academicYear, feeYearStart);
  const display = feeYearRange(feeYearStart);
  return {
    feeYearStart,
    feeYearLabel: feeYearLabel(feeYearStart),
    asOfMonth: asOf.slice(0, 7),
    fromMonth: `${startYear}-04`,
    throughMonth: display.throughMonth,
  };
}

function inFeeYear(month: string, feeYearStart: number) {
  const range = feeYearRange(feeYearStart);
  return month >= range.fromMonth && month <= range.throughMonth;
}

export function dueInRange(
  account: FeeAccount,
  fromMonth: string,
  toMonth: string,
) {
  let sum = 0;
  for (const month of account.months) {
    if (month.month < fromMonth || month.month > toMonth) {
      continue;
    }
    if (month.coverage !== "due" && month.coverage !== "partial") {
      continue;
    }
    sum = roundMoney(sum + month.balance);
  }
  const feeYearStart = feeYearStartYear(toMonth);
  if (Number.isFinite(feeYearStart) && fromMonth <= `${feeYearStart}-04`) {
    sum = roundMoney(sum + account.priorDue);
  }
  return sum;
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

export function scheduleStartYear(academicYear: string, feeYearStart: number) {
  const match = academicYear.match(/(\d{4})/);
  const parsed = match ? Number(match[1]) : feeYearStart;
  if (!Number.isFinite(parsed) || parsed < 2000 || parsed > 2100) {
    return feeYearStart;
  }
  return Math.min(parsed, feeYearStart);
}

export function buildFeeAccount(args: {
  monthlyRate: number;
  paid: number;
  fromMonth: string;
  throughMonth: string;
  asOfMonth: string;
  feeYearStart: number;
  monthCharges?: Readonly<Record<string, number>>;
  /** Collection discounts already saved against fee-year months, in rupees. */
  monthDiscounts?: Readonly<Record<string, number>>;
}): FeeAccount {
  const monthlyRate = roundMoney(Math.max(0, args.monthlyRate));
  const paid = roundMoney(Math.max(0, args.paid));
  const months: FeeMonthLine[] = [];
  let pool = paid;
  let chargedToDate = 0;
  let yearTotal = 0;
  let priorUnpaid = 0;
  let displayRate = monthlyRate;

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
    const gross = roundMoney(
      Math.max(0, args.monthCharges?.[key] ?? monthlyRate),
    );
    const waived = roundMoney(
      Math.min(gross, Math.max(0, args.monthDiscounts?.[key] ?? 0)),
    );
    const charge = roundMoney(Math.max(0, gross - waived));
    if (key === args.asOfMonth && gross > 0) {
      displayRate = gross;
    }
    if (inWindow && gross > 0) {
      const open = key <= args.asOfMonth;
      const applied = roundMoney(Math.min(charge, pool));
      pool = roundMoney(pool - applied);
      const balance = roundMoney(charge - applied);
      if (open) {
        chargedToDate = roundMoney(chargedToDate + charge);
        if (key < `${args.feeYearStart}-04`) {
          priorUnpaid = roundMoney(priorUnpaid + balance);
        }
      }
      if (inFeeYear(key, args.feeYearStart)) {
        yearTotal = roundMoney(yearTotal + charge);
        months.push({
          month: key,
          label: monthLabel(key),
          charge: gross,
          discount: waived,
          applied,
          balance,
          coverage: coverageFor(open, charge, applied, balance),
        });
      }
    } else if (inWindow && inFeeYear(key, args.feeYearStart)) {
      yearTotal = roundMoney(yearTotal + charge);
      months.push({
        month: key,
        label: monthLabel(key),
        charge: 0,
        discount: 0,
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
    monthlyRate: displayRate,
    chargedToDate,
    paid,
    due,
    advance,
    yearTotal,
    priorDue: priorUnpaid,
    months,
  };
}

export type PaymentAllocationLine = {
  month: string;
  label: string;
  charge: number;
  dueBefore: number;
  paid: number;
};

export function allocatePayment(args: {
  monthlyRate: number;
  paidBefore: number;
  amount: number;
  fromMonth: string;
  throughMonth: string;
  monthCharges?: Readonly<Record<string, number>>;
  monthDiscounts?: Readonly<Record<string, number>>;
}): { lines: PaymentAllocationLine[]; unallocated: number } {
  const monthlyRate = roundMoney(Math.max(0, args.monthlyRate));
  let before = roundMoney(Math.max(0, args.paidBefore));
  let remaining = roundMoney(Math.max(0, args.amount));
  const lines: PaymentAllocationLine[] = [];

  const [fromYear, fromMonth] = args.fromMonth.split("-").map(Number);
  const [throughYear, throughMonth] = args.throughMonth.split("-").map(Number);
  if (
    !fromYear ||
    !fromMonth ||
    !throughYear ||
    !throughMonth ||
    (monthlyRate <= 0 && !args.monthCharges)
  ) {
    return { lines, unallocated: remaining };
  }

  let year = fromYear;
  let month = fromMonth;
  while (
    remaining > 0 &&
    (year < throughYear || (year === throughYear && month <= throughMonth))
  ) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const gross = roundMoney(
      Math.max(0, args.monthCharges?.[key] ?? monthlyRate),
    );
    const waived = roundMoney(Math.max(0, args.monthDiscounts?.[key] ?? 0));
    const charge = roundMoney(Math.max(0, gross - waived));
    const coveredBefore = roundMoney(Math.min(charge, before));
    before = roundMoney(before - coveredBefore);
    const dueBefore = roundMoney(charge - coveredBefore);
    if (dueBefore > 0) {
      const paid = roundMoney(Math.min(dueBefore, remaining));
      remaining = roundMoney(remaining - paid);
      lines.push({
        month: key,
        label: monthLabel(key),
        charge,
        dueBefore,
        paid,
      });
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return { lines, unallocated: remaining };
}

export type DiscountMethod = "equal" | "first" | "last";

export type DiscountAllocation = {
  month: string;
  amount: number;
};

function toPaise(value: number) {
  return Math.round(roundMoney(value) * 100);
}

function fromPaise(paise: number) {
  return roundMoney(paise / 100);
}

/** Saved academic collection discounts, summed by fee-year month. */
export function academicMonthDiscounts(
  payments: ReadonlyArray<{
    kind: "academic" | "transport";
    discountLines?: ReadonlyArray<{ month: string; amount: number }>;
  }>,
) {
  const totals: Record<string, number> = {};
  for (const payment of payments) {
    if (payment.kind !== "academic" || !payment.discountLines) {
      continue;
    }
    for (const line of payment.discountLines) {
      const amount = roundMoney(line.amount);
      if (amount <= 0) {
        continue;
      }
      totals[line.month] = roundMoney((totals[line.month] ?? 0) + amount);
    }
  }
  return totals;
}

/**
 * Spread a collection discount across fee-year months that still have a balance.
 * Pass the current statement months (April through March). Fully paid months are skipped.
 * Equal keeps only the earliest months whose running remaining balance stays within
 * the cash collected plus the discount, then splits paise as evenly as possible.
 * Leftover paise go on the last of those months. First walks April toward March.
 * Last walks March toward April.
 */
export function allocateCollectionDiscount(args: {
  method: DiscountMethod;
  discount: number;
  /** Cash collected with this payment. Equal split uses it to choose months. */
  amount: number;
  months: ReadonlyArray<{ month: string; balance: number }>;
}): DiscountAllocation[] {
  const discount = roundMoney(args.discount);
  if (!Number.isFinite(discount) || discount < 0) {
    throw new Error("Discount must be zero or greater");
  }
  if (discount === 0) {
    return [];
  }
  const ordered = [...args.months]
    .filter((month) => roundMoney(month.balance) > 0)
    .sort((left, right) => left.month.localeCompare(right.month));
  const discountPaise = toPaise(discount);
  const capacityPaise = ordered.reduce(
    (sum, month) => sum + toPaise(month.balance),
    0,
  );
  if (ordered.length === 0 || discountPaise > capacityPaise) {
    throw new Error(
      "Discount cannot be larger than the year's academic dues",
    );
  }

  if (args.method === "equal") {
    const collected = roundMoney(args.amount);
    if (!Number.isFinite(collected) || collected < 0) {
      throw new Error("Amount collected must be zero or greater");
    }
    if (discount > collected) {
      throw new Error(
        "Discount cannot be larger than the amount being collected",
      );
    }
    const limitPaise = toPaise(collected) + discountPaise;
    const included: Array<{ month: string; balancePaise: number }> = [];
    let cumulative = 0;
    for (const month of ordered) {
      const balancePaise = toPaise(month.balance);
      const next = cumulative + balancePaise;
      if (next > limitPaise) {
        break;
      }
      cumulative = next;
      included.push({ month: month.month, balancePaise });
    }
    if (included.length === 0) {
      throw new Error(
        "No fee month is fully covered by the amount paid plus this discount, so the discount cannot be divided equally. Pay more, lower the discount, or choose another way to apply it.",
      );
    }
    const count = included.length;
    const base = Math.floor(discountPaise / count);
    const remainder = discountPaise - base * count;
    const lines: DiscountAllocation[] = [];
    for (let index = 0; index < count; index += 1) {
      const extra = index >= count - remainder ? 1 : 0;
      const share = base + extra;
      if (share > included[index].balancePaise) {
        throw new Error(
          "This discount cannot be split equally across the months it covers. One of those months does not have enough left. Lower the discount or choose another way to apply it.",
        );
      }
      if (share > 0) {
        lines.push({
          month: included[index].month,
          amount: fromPaise(share),
        });
      }
    }
    return lines;
  }

  const walk = args.method === "last" ? [...ordered].reverse() : ordered;
  const lines: DiscountAllocation[] = [];
  let left = discountPaise;
  for (const month of walk) {
    if (left <= 0) {
      break;
    }
    const cap = toPaise(month.balance);
    if (cap <= 0) {
      continue;
    }
    const share = Math.min(cap, left);
    left -= share;
    lines.push({ month: month.month, amount: fromPaise(share) });
  }
  if (left > 0) {
    throw new Error(
      "Discount cannot be larger than the year's academic dues",
    );
  }
  return lines;
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
