import { allocateCollectionDiscount } from "../convex/lib/feeLedger";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function paise(value: number) {
  return Math.round(value * 100);
}

const months = [
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
].map((month) => ({ month, balance: 1000 }));

const lines = allocateCollectionDiscount({
  method: "equal",
  discount: 800,
  amount: 3200,
  months,
});

assert(lines.length === 4, `expected 4 discount lines, got ${lines.length}`);
for (let index = 0; index < 4; index += 1) {
  assert(
    lines[index].month === months[index].month && lines[index].amount === 200,
    `expected 200 on ${months[index].month}, got ${lines[index].amount} on ${lines[index].month}`,
  );
}
assert(
  paise(lines.reduce((sum, line) => sum + line.amount, 0)) === 80000,
  "equal split must sum to the discount",
);

const odd = allocateCollectionDiscount({
  method: "equal",
  discount: 800.03,
  amount: 3200,
  months,
});
const oddAmounts = odd.map((line) => line.amount);
assert(
  oddAmounts.join(",") === "200,200.01,200.01,200.01",
  `leftover paise should sit on the last included months, got ${oddAmounts.join(",")}`,
);
assert(
  paise(odd.reduce((sum, line) => sum + line.amount, 0)) === 80003,
  "odd equal split must sum to the discount",
);

const uneven = allocateCollectionDiscount({
  method: "equal",
  discount: 800,
  amount: 3200,
  months: [
    { month: "2026-04", balance: 2000 },
    { month: "2026-05", balance: 2000 },
    { month: "2026-06", balance: 1000 },
    { month: "2026-07", balance: 1000 },
  ],
});
assert(
  uneven.map((line) => `${line.month}:${line.amount}`).join(",") ===
    "2026-04:400,2026-05:400",
  `expected the first two months only, got ${JSON.stringify(uneven)}`,
);

const first = allocateCollectionDiscount({
  method: "first",
  discount: 800,
  amount: 3200,
  months,
});
assert(
  first.length === 1 && first[0].month === "2026-04" && first[0].amount === 800,
  "first-month split should stay on the earliest month",
);

const last = allocateCollectionDiscount({
  method: "last",
  discount: 800,
  amount: 3200,
  months,
});
assert(
  last.length === 1 && last[0].month === "2026-10" && last[0].amount === 800,
  "last-month split should stay on the latest month",
);

let rejectedEmpty = false;
try {
  allocateCollectionDiscount({
    method: "equal",
    discount: 100,
    amount: 100,
    months,
  });
} catch (error) {
  rejectedEmpty = error instanceof Error && error.message.includes("No fee month");
}
assert(rejectedEmpty, "expected a rejection when no month is fully covered");

let rejectedShare = false;
try {
  allocateCollectionDiscount({
    method: "equal",
    discount: 100,
    amount: 100,
    months: [{ month: "2026-04", balance: 50 }, ...months.slice(1)],
  });
} catch (error) {
  rejectedShare =
    error instanceof Error && error.message.includes("does not have enough left");
}
assert(
  rejectedShare,
  "expected a rejection when an included month cannot hold its share",
);

console.log(
  "equal split ok: 200 on April–July, 0 after; leftover paise on the last included months",
);
