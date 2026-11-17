import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import { isIsoDate, requireSchoolAdmin, requireSchoolViewer } from "./lib/auth";

const MAX_ODOMETER = 10_000_000;
const MAX_LITERS = 2_000;
const MAX_PRICE = 500_000;

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function isYearMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function monthAfter(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, mon, 1));
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
  return `${next.getUTCFullYear()}-${nextMonth}-01`;
}

function todayInIndia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function assertMoney(value: number, label: string, max: number) {
  if (!Number.isFinite(value) || value <= 0 || value > max) {
    throw new ConvexError(`${label} must be greater than 0`);
  }
  if (round2(value) !== value) {
    throw new ConvexError(`${label} can have at most 2 decimal places`);
  }
}

function assertOdometer(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_ODOMETER) {
    throw new ConvexError("Enter a valid odometer reading");
  }
  if (round1(value) !== value) {
    throw new ConvexError("Odometer can have at most 1 decimal place");
  }
}

async function purchasesForBus(
  ctx: QueryCtx | MutationCtx,
  busId: Id<"buses">,
) {
  return await ctx.db
    .query("fuelPurchases")
    .withIndex("by_bus", (q) => q.eq("busId", busId))
    .take(500);
}

function readingBefore(
  startingOdometer: number,
  purchases: Doc<"fuelPurchases">[],
  odometer: number,
  exceptId?: Id<"fuelPurchases">,
) {
  const earlier = purchases.filter(
    (row) => row._id !== exceptId && row.odometer < odometer,
  );
  if (earlier.length === 0) {
    return startingOdometer;
  }
  return Math.max(...earlier.map((row) => row.odometer));
}

function sameFill(
  fill: Doc<"fuelPurchases">,
  next: {
    busId: Id<"buses">;
    date: string;
    odometer: number;
    liters: number;
    price: number;
  },
) {
  return (
    fill.busId === next.busId &&
    fill.date === next.date &&
    fill.odometer === next.odometer &&
    fill.liters === next.liters &&
    fill.price === next.price
  );
}

function mileageSince(
  startOdometer: number,
  purchases: Doc<"fuelPurchases">[],
) {
  if (purchases.length === 0) {
    return null;
  }
  const latest = purchases.reduce((max, row) =>
    row.odometer > max.odometer ? row : max,
  );
  const liters = purchases.reduce((sum, row) => sum + row.liters, 0);
  const distance = round1(latest.odometer - startOdometer);
  if (distance <= 0 || liters <= 0) {
    return null;
  }
  return round2(distance / liters);
}

function fillMileage(
  previousOdometer: number,
  odometer: number,
  liters: number,
) {
  const distance = round1(odometer - previousOdometer);
  if (distance <= 0 || liters <= 0) {
    return null;
  }
  return round2(distance / liters);
}

export const overview = query({
  args: { month: v.string() },
  returns: v.object({
    monthTotal: v.number(),
    buses: v.array(
      v.object({
        busId: v.id("buses"),
        name: v.string(),
        number: v.string(),
        odometer: v.number(),
        startingOdometer: v.number(),
        mileage: v.union(v.number(), v.null()),
        monthExpense: v.number(),
        monthLiters: v.number(),
        readings: v.array(
          v.object({
            fillId: v.id("fuelPurchases"),
            odometer: v.number(),
          }),
        ),
      }),
    ),
    fills: v.array(
      v.object({
        fillId: v.id("fuelPurchases"),
        busId: v.id("buses"),
        busName: v.string(),
        busNumber: v.string(),
        date: v.string(),
        odometer: v.number(),
        liters: v.number(),
        price: v.number(),
        mileage: v.union(v.number(), v.null()),
        edited: v.boolean(),
        original: v.union(
          v.null(),
          v.object({
            busName: v.string(),
            busNumber: v.string(),
            date: v.string(),
            odometer: v.number(),
            liters: v.number(),
            price: v.number(),
            mileage: v.union(v.number(), v.null()),
          }),
        ),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireSchoolViewer(ctx);
    if (!isYearMonth(args.month)) {
      throw new ConvexError("Month must be YYYY-MM");
    }
    const buses = await ctx.db.query("buses").take(100);
    const monthFills = await ctx.db
      .query("fuelPurchases")
      .withIndex("by_date", (q) =>
        q.gte("date", `${args.month}-01`).lt("date", monthAfter(args.month)),
      )
      .take(2000);

    const purchasesByBus = new Map<Id<"buses">, Doc<"fuelPurchases">[]>();
    const busRows = [];
    for (const bus of buses.sort((a, b) => a.name.localeCompare(b.name))) {
      const purchases = await purchasesForBus(ctx, bus._id);
      purchasesByBus.set(bus._id, purchases);
      const inMonth = monthFills.filter((row) => row.busId === bus._id);
      busRows.push({
        busId: bus._id,
        name: bus.name,
        number: bus.number,
        odometer: bus.odometer,
        startingOdometer: bus.startingOdometer,
        mileage: mileageSince(bus.startingOdometer, purchases),
        monthExpense: round2(inMonth.reduce((sum, row) => sum + row.price, 0)),
        monthLiters: round2(inMonth.reduce((sum, row) => sum + row.liters, 0)),
        readings: purchases.map((row) => ({
          fillId: row._id,
          odometer: row.odometer,
        })),
      });
    }

    const busById = new Map(buses.map((bus) => [bus._id, bus]));
    const fills = [];
    for (const fill of monthFills) {
      const bus = busById.get(fill.busId);
      if (!bus) {
        continue;
      }
      const purchases = purchasesByBus.get(fill.busId) ?? [];
      const previous = readingBefore(
        bus.startingOdometer,
        purchases,
        fill.odometer,
        fill._id,
      );
      const stored = fill.original;
      const edited = stored
        ? !sameFill(fill, {
            busId: stored.busId,
            date: stored.date,
            odometer: stored.odometer,
            liters: stored.liters,
            price: stored.price,
          })
        : false;
      const originalBus = stored ? busById.get(stored.busId) : undefined;
      fills.push({
        fillId: fill._id,
        busId: fill.busId,
        busName: bus.name,
        busNumber: bus.number,
        date: fill.date,
        odometer: fill.odometer,
        liters: fill.liters,
        price: fill.price,
        mileage: fillMileage(previous, fill.odometer, fill.liters),
        edited,
        original:
          stored && edited
            ? {
                busName: originalBus?.name ?? "Unknown bus",
                busNumber: originalBus?.number ?? "",
                date: stored.date,
                odometer: stored.odometer,
                liters: stored.liters,
                price: stored.price,
                mileage: fillMileage(
                  stored.previousOdometer,
                  stored.odometer,
                  stored.liters,
                ),
              }
            : null,
      });
    }
    fills.sort((a, b) => b.date.localeCompare(a.date) || b.odometer - a.odometer);

    return {
      monthTotal: round2(monthFills.reduce((sum, row) => sum + row.price, 0)),
      buses: busRows,
      fills,
    };
  },
});

export const addBus = mutation({
  args: {
    name: v.string(),
    number: v.string(),
    odometer: v.number(),
  },
  returns: v.id("buses"),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const name = args.name.trim().replace(/\s+/g, " ");
    const number = args.number.trim().toUpperCase().replace(/\s+/g, " ");
    if (!name || name.length > 80) {
      throw new ConvexError("Enter a bus name");
    }
    if (!number || number.length > 20) {
      throw new ConvexError("Enter a bus number");
    }
    assertOdometer(args.odometer);
    const existing = await ctx.db
      .query("buses")
      .withIndex("by_number", (q) => q.eq("number", number))
      .unique();
    if (existing) {
      throw new ConvexError("A bus with this number already exists");
    }
    return await ctx.db.insert("buses", {
      name,
      number,
      startingOdometer: args.odometer,
      odometer: args.odometer,
    });
  },
});

export const recordFuel = mutation({
  args: {
    busId: v.id("buses"),
    date: v.string(),
    odometer: v.number(),
    liters: v.number(),
    price: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireSchoolAdmin(ctx);
    const bus = await ctx.db.get("buses", args.busId);
    if (!bus) {
      throw new ConvexError("Bus not found");
    }
    if (!isIsoDate(args.date) || args.date > todayInIndia()) {
      throw new ConvexError("Enter a valid date");
    }
    assertOdometer(args.odometer);
    if (args.odometer <= bus.odometer) {
      throw new ConvexError(
        "Odometer reading must be higher than the last reading",
      );
    }
    assertMoney(args.liters, "Fuel amount", MAX_LITERS);
    assertMoney(args.price, "Price", MAX_PRICE);
    const purchases = await purchasesForBus(ctx, bus._id);
    if (purchases.some((row) => row.date === args.date && row.odometer === args.odometer)) {
      throw new ConvexError("This fuel entry is already recorded");
    }
    await ctx.db.insert("fuelPurchases", {
      busId: bus._id,
      date: args.date,
      odometer: args.odometer,
      liters: args.liters,
      price: args.price,
      recordedBy: user._id,
    });
    await ctx.db.patch("buses", bus._id, { odometer: args.odometer });
    return null;
  },
});

async function syncBusOdometer(ctx: MutationCtx, busId: Id<"buses">) {
  const bus = await ctx.db.get("buses", busId);
  if (!bus) {
    return;
  }
  const purchases = await purchasesForBus(ctx, busId);
  const odometer = purchases.reduce(
    (max, row) => Math.max(max, row.odometer),
    bus.startingOdometer,
  );
  if (odometer !== bus.odometer) {
    await ctx.db.patch("buses", busId, { odometer });
  }
}

export const updateFuel = mutation({
  args: {
    fillId: v.id("fuelPurchases"),
    busId: v.id("buses"),
    date: v.string(),
    odometer: v.number(),
    liters: v.number(),
    price: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSchoolAdmin(ctx);
    const fill = await ctx.db.get("fuelPurchases", args.fillId);
    if (!fill) {
      throw new ConvexError("Fuel entry not found");
    }
    const bus = await ctx.db.get("buses", args.busId);
    if (!bus) {
      throw new ConvexError("Bus not found");
    }
    if (!isIsoDate(args.date) || args.date > todayInIndia()) {
      throw new ConvexError("Enter a valid date");
    }
    assertOdometer(args.odometer);
    assertMoney(args.liters, "Fuel amount", MAX_LITERS);
    assertMoney(args.price, "Price", MAX_PRICE);
    if (
      sameFill(fill, {
        busId: args.busId,
        date: args.date,
        odometer: args.odometer,
        liters: args.liters,
        price: args.price,
      })
    ) {
      return null;
    }

    const purchases = await purchasesForBus(ctx, bus._id);
    const others = purchases.filter((row) => row._id !== fill._id);
    const clash = others.find((row) => row.odometer === args.odometer);
    if (clash) {
      throw new ConvexError(
        clash.date === args.date
          ? "This fuel entry is already recorded"
          : "Enter a valid odometer reading",
      );
    }
    const previous = readingBefore(bus.startingOdometer, others, args.odometer);
    if (args.odometer <= previous) {
      throw new ConvexError(
        "Odometer reading must be higher than the last reading",
      );
    }

    let original = fill.original;
    if (!original) {
      const sourceBus =
        fill.busId === bus._id ? bus : await ctx.db.get("buses", fill.busId);
      if (!sourceBus) {
        throw new ConvexError("Bus not found");
      }
      const sourcePurchases =
        fill.busId === bus._id
          ? purchases
          : await purchasesForBus(ctx, fill.busId);
      original = {
        busId: fill.busId,
        date: fill.date,
        odometer: fill.odometer,
        liters: fill.liters,
        price: fill.price,
        previousOdometer: readingBefore(
          sourceBus.startingOdometer,
          sourcePurchases,
          fill.odometer,
          fill._id,
        ),
      };
    }

    await ctx.db.patch("fuelPurchases", fill._id, {
      busId: bus._id,
      date: args.date,
      odometer: args.odometer,
      liters: args.liters,
      price: args.price,
      original,
    });
    await syncBusOdometer(ctx, fill.busId);
    if (fill.busId !== bus._id) {
      await syncBusOdometer(ctx, bus._id);
    }
    return null;
  },
});
