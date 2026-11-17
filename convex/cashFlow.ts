import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { QueryCtx, mutation, query } from "./_generated/server";
import {
  isIsoDate,
  rejectObserver,
  requireSchoolAdmin,
  requireSchoolViewer,
} from "./lib/auth";
import { studentName } from "./lib/studentName";

const MAX_AMOUNT = 10_000_000;
const MAX_NOTE = 200;

const paymentModeValidator = v.union(v.literal("cash"), v.literal("online"));

const creditSourceValidator = v.union(
  v.literal("fee"),
  v.literal("transport"),
  v.literal("fund"),
);

const expenseKindValidator = v.union(
  v.literal("salary"),
  v.literal("office"),
  v.literal("fuel"),
  v.literal("stock"),
);

const movementValidator = v.object({
  id: v.string(),
  date: v.string(),
  description: v.string(),
  direction: v.union(v.literal("credit"), v.literal("debit")),
  amount: v.number(),
  mode: v.optional(paymentModeValidator),
  source: v.optional(creditSourceValidator),
  expense: v.optional(expenseKindValidator),
});

function moneyFromCents(cents: number) {
  return cents / 100;
}

function toCents(value: number) {
  return Math.round(value * 100);
}

function assertAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConvexError("Amount must be greater than 0");
  }
  if (value > MAX_AMOUNT) {
    throw new ConvexError("Amount must be at most 10,000,000");
  }
  if (Math.round(value * 100) / 100 !== value) {
    throw new ConvexError("Amount can have at most 2 decimal places");
  }
}

function assertDate(value: string) {
  if (!isIsoDate(value)) {
    throw new ConvexError("Date must be YYYY-MM-DD");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ConvexError("Enter a real date");
  }
}

function staffLabel(user: Doc<"users"> | undefined) {
  return user?.name?.trim() || user?.email?.trim() || "Staff";
}

type PaymentMode = "cash" | "online";

type CreditSource = "fee" | "transport" | "fund";

type ExpenseKind = "salary" | "office" | "fuel" | "stock";

type Movement = {
  id: string;
  date: string;
  description: string;
  direction: "credit" | "debit";
  amount: number;
  mode?: PaymentMode;
  source?: CreditSource;
  expense?: ExpenseKind;
  created: number;
};

function storedMode(mode: string | undefined): PaymentMode | undefined {
  return mode === "cash" || mode === "online" ? mode : undefined;
}

async function byId<TableName extends "students" | "users" | "buses" | "stockItems">(
  ctx: QueryCtx,
  table: TableName,
  ids: Id<TableName>[],
) {
  const unique = [...new Set(ids)];
  const rows = await Promise.all(unique.map((id) => ctx.db.get(table, id)));
  const map = new Map<Id<TableName>, Doc<TableName>>();
  for (const row of rows) {
    if (row) {
      map.set(row._id, row);
    }
  }
  return map;
}

export const summary = query({
  args: {},
  returns: v.object({
    credited: v.number(),
    debited: v.number(),
    balance: v.number(),
    movements: v.array(movementValidator),
  }),
  handler: async (ctx) => {
    await requireSchoolViewer(ctx);

    const [payments, funds, expenses, salaries, fuel, stock] = await Promise.all([
      ctx.db.query("feePayments").collect(),
      ctx.db.query("schoolFunds").collect(),
      ctx.db.query("officeExpenses").collect(),
      ctx.db.query("staffPayments").collect(),
      ctx.db.query("fuelPurchases").collect(),
      ctx.db.query("stockPurchases").collect(),
    ]);

    const [students, staff, buses, items] = await Promise.all([
      byId(
        ctx,
        "students",
        payments.map((row) => row.studentId),
      ),
      byId(
        ctx,
        "users",
        salaries.map((row) => row.userId),
      ),
      byId(
        ctx,
        "buses",
        fuel.map((row) => row.busId),
      ),
      byId(
        ctx,
        "stockItems",
        stock.map((row) => row.itemId),
      ),
    ]);

    const movements: Movement[] = [];
    let creditCents = 0;
    let debitCents = 0;

    function add(movement: Movement) {
      const cents = toCents(movement.amount);
      if (cents <= 0) {
        return;
      }
      movement.amount = moneyFromCents(cents);
      movements.push(movement);
      if (movement.direction === "credit") {
        creditCents += cents;
      } else {
        debitCents += cents;
      }
    }

    for (const payment of payments) {
      const student = students.get(payment.studentId);
      const name = student ? studentName(student) : "";
      const label = payment.kind === "transport" ? "Transport" : "Fee";
      add({
        id: `fee:${payment._id}`,
        date: payment.paidOn,
        description: name ? `${label} — ${name}` : label,
        direction: "credit",
        amount: payment.amount,
        mode: storedMode(payment.mode),
        source: payment.kind === "transport" ? "transport" : "fee",
        created: payment._creationTime,
      });
    }

    for (const fund of funds) {
      const note = fund.note?.trim();
      add({
        id: `fund:${fund._id}`,
        date: fund.date,
        description: note ? `Fund — ${note}` : "Fund",
        direction: "credit",
        amount: fund.amount,
        mode: storedMode(fund.mode),
        source: "fund",
        created: fund._creationTime,
      });
    }

    for (const expense of expenses) {
      add({
        id: `expense:${expense._id}`,
        date: expense.date,
        description: `Expense — ${expense.description}`,
        direction: "debit",
        amount: expense.amount,
        expense: "office",
        created: expense._creationTime,
      });
    }

    for (const salary of salaries) {
      add({
        id: `salary:${salary._id}`,
        date: salary.paidOn,
        description: `Salary — ${staffLabel(staff.get(salary.userId))}`,
        direction: "debit",
        amount: salary.amount,
        mode: storedMode(salary.mode),
        expense: "salary",
        created: salary._creationTime,
      });
    }

    for (const fill of fuel) {
      const bus = buses.get(fill.busId);
      const busLabel = bus ? `${bus.name} (${bus.number})` : "";
      add({
        id: `fuel:${fill._id}`,
        date: fill.date,
        description: busLabel ? `Fuel — ${busLabel}` : "Fuel",
        direction: "debit",
        amount: fill.price,
        expense: "fuel",
        created: fill._creationTime,
      });
    }

    for (const purchase of stock) {
      const itemName = items.get(purchase.itemId)?.name.trim() ?? "";
      add({
        id: `stock:${purchase._id}`,
        date: purchase.date,
        description: itemName ? `Stock — ${itemName}` : "Stock",
        direction: "debit",
        amount: purchase.total,
        expense: "stock",
        created: purchase._creationTime,
      });
    }

    movements.sort(
      (a, b) => b.date.localeCompare(a.date) || b.created - a.created,
    );

    return {
      credited: moneyFromCents(creditCents),
      debited: moneyFromCents(debitCents),
      balance: moneyFromCents(creditCents - debitCents),
      movements: movements.map(
        ({ created: _created, mode, source, expense, ...movement }) => ({
          ...movement,
          ...(mode ? { mode } : {}),
          ...(source ? { source } : {}),
          ...(expense ? { expense } : {}),
        }),
      ),
    };
  },
});

export const addFund = mutation({
  args: {
    amount: v.number(),
    date: v.string(),
    note: v.optional(v.string()),
    mode: paymentModeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireSchoolAdmin(ctx);
    rejectObserver(user);
    assertAmount(args.amount);
    assertDate(args.date);
    const note = args.note?.trim() ?? "";
    if (note.length > MAX_NOTE) {
      throw new ConvexError("Note is too long");
    }
    if (args.mode !== "cash" && args.mode !== "online") {
      throw new ConvexError("Choose a payment mode: cash or online");
    }
    await ctx.db.insert("schoolFunds", {
      amount: args.amount,
      date: args.date,
      mode: args.mode,
      ...(note ? { note } : {}),
      enteredBy: user._id,
    });
    return null;
  },
});
