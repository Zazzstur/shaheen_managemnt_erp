"use client";

import { Fragment, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, Plus, Printer, Trash2 } from "lucide-react";
import { api } from "@convex/_generated/api";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { StockGate } from "@/components/stock-frame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function productKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function money(value: number) {
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
}

function reportDate(value: string) {
  return new Date(`${value}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type StockLine = {
  id: string;
  name: string;
  quantity: string;
  price: string;
};

type DraftLine = {
  name: string;
  quantity: number;
  price: number;
};

type PaymentMode = "cash" | "online";

const paymentModeLabel: Record<PaymentMode, string> = {
  cash: "Cash",
  online: "Online",
};

function blankLine(): StockLine {
  return {
    id: crypto.randomUUID(),
    name: "",
    quantity: "",
    price: "",
  };
}

function ProductNameField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const term = value.trim();
  const key = productKey(value);
  const matches = useQuery(api.stock.searchItems, key ? { term } : "skip");
  const exact = matches?.find((item) => productKey(item.name) === key);

  return (
    <div className="space-y-1">
      <Input
        id={id}
        role="combobox"
        aria-label="Product name"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && term && matches ? (
        <div
          id={`${id}-list`}
          role="listbox"
          className="rounded-lg border bg-popover p-1 text-sm"
        >
          {matches.length === 0 ? (
            <p className="px-2 py-1.5 text-muted-foreground">
              New product. It will be created when you add stock.
            </p>
          ) : (
            matches.map((item) => (
              <button
                key={item.itemId}
                type="button"
                role="option"
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(item.name);
                  setOpen(false);
                }}
              >
                <span className="font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.quantity} in stock
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
      {exact ? (
        <p className="text-xs text-muted-foreground">
          Already in inventory: {exact.quantity} in stock
        </p>
      ) : term && matches && matches.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          This name is not in inventory yet.
        </p>
      ) : null}
    </div>
  );
}

function PurchaseHistory({ openId, onOpen }: { openId: string | null; onOpen: (id: string | null) => void }) {
  const history = useQuery(api.stock.purchaseHistory);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock purchase history</CardTitle>
        <CardDescription>
          Date and total for each purchase. Open a row to see the products.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {history === undefined ? (
          <p className="text-sm text-muted-foreground">Loading purchase history…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No purchases yet.</p>
        ) : (
          <ul className="divide-y">
            {history.map((purchase) => {
              const open = openId === purchase.purchaseId;
              return (
                <li
                  key={purchase.purchaseId}
                  className={open ? "" : "print:hidden"}
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 py-3 text-left"
                    aria-expanded={open}
                    onClick={() => onOpen(open ? null : purchase.purchaseId)}
                  >
                    <span>{reportDate(purchase.date)}</span>
                    <span className="ml-auto font-medium">{money(purchase.total)}</span>
                    <ChevronDown
                      className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                  {open ? (
                    <div className="pb-4">
                      {purchase.mode ? (
                        <p className="mb-3 text-sm text-muted-foreground">
                          Paid by {paymentModeLabel[purchase.mode]}
                        </p>
                      ) : null}
                      <div className="mb-3 flex justify-end print:hidden">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => window.print()}
                        >
                          <Printer />
                          Print
                        </Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                            <TableHead className="text-right">Total paid</TableHead>
                            <TableHead className="text-right">Unit price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {purchase.lines.map((line, index) => (
                            <TableRow key={`${line.name}-${index}`}>
                              <TableCell className="font-medium">{line.name}</TableCell>
                              <TableCell className="text-right">{line.quantity}</TableCell>
                              <TableCell className="text-right">{money(line.total)}</TableCell>
                              <TableCell className="text-right">{money(line.unitPrice)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell>
                              {purchase.lines.length}{" "}
                              {purchase.lines.length === 1 ? "product" : "products"}
                            </TableCell>
                            <TableCell />
                            <TableCell className="text-right">{money(purchase.total)}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AddStockForm() {
  const addItems = useMutation(api.stock.addItems);
  const [lines, setLines] = useState<StockLine[]>(() => [blankLine()]);
  const [saving, setSaving] = useState(false);
  const [openPurchaseId, setOpenPurchaseId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftLine[] | null>(null);
  const [mode, setMode] = useState<PaymentMode | null>(null);

  function updateLine(id: string, patch: Partial<StockLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }

  function collectLines() {
    const prepared: DraftLine[] = [];
    for (const line of lines) {
      const name = line.name.trim();
      const quantityText = line.quantity.trim();
      const priceText = line.price.trim();
      if (!name && !quantityText && !priceText) {
        continue;
      }
      const quantity = Number(quantityText);
      const price = Number(priceText);
      const rounded = Math.round(price * 100) / 100;
      if (
        !name ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        !Number.isFinite(price) ||
        Math.abs(price - rounded) > 0.001
      ) {
        toast.error(
          "Each row needs a product name, a whole quantity, and a total price",
        );
        return null;
      }
      prepared.push({ name, quantity, price: rounded });
    }
    if (prepared.length === 0) {
      toast.error("Add at least one product");
      return null;
    }
    return prepared;
  }

  function openConfirm() {
    const prepared = collectLines();
    if (!prepared) {
      return;
    }
    setMode(null);
    setDraft(prepared);
  }

  async function confirmAdd() {
    if (!draft || !mode) {
      return;
    }
    setSaving(true);
    try {
      const purchaseId = await addItems({ items: draft, mode });
      setOpenPurchaseId(purchaseId);
      setLines([blankLine()]);
      setDraft(null);
      setMode(null);
      toast.success(
        draft.length === 1
          ? "1 product added to stock"
          : `${draft.length} products added to stock`,
      );
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  const draftTotal = draft
    ? Math.round(draft.reduce((sum, line) => sum + line.price, 0) * 100) / 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Add stock</h1>
        <p className="text-sm text-muted-foreground">
          Enter each product, then add them all to inventory at once.
        </p>
      </div>
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>
            Name, how many are being added, and the total price paid for that
            quantity. Use Add item for another row.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-[minmax(0,1fr)_5.25rem_6.75rem_2rem] items-start gap-x-2 gap-y-3">
            <Label htmlFor="stock-name-0">Product name</Label>
            <Label htmlFor="stock-quantity-0">Quantity</Label>
            <Label htmlFor="stock-price-0">Total price (₹)</Label>
            <span aria-hidden="true" />
            {lines.map((line, index) => (
              <Fragment key={line.id}>
                <ProductNameField
                  id={`stock-name-${index}`}
                  value={line.name}
                  onChange={(name) => updateLine(line.id, { name })}
                />
                <Input
                  id={`stock-quantity-${index}`}
                  aria-label="Quantity"
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(event) =>
                    updateLine(line.id, { quantity: event.target.value })
                  }
                />
                <Input
                  id={`stock-price-${index}`}
                  aria-label="Total price"
                  inputMode="decimal"
                  value={line.price}
                  onChange={(event) =>
                    updateLine(line.id, { price: event.target.value })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove item"
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((item) => item.id !== line.id),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </Fragment>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setLines((current) => [...current, blankLine()])}
          >
            <Plus />
            Add item
          </Button>
          <Button
            type="button"
            className="w-full"
            disabled={saving}
            onClick={openConfirm}
          >
            Add stock
          </Button>
        </CardContent>
      </Card>
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setDraft(null);
            setMode(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm stock</DialogTitle>
            <DialogDescription>
              Check the items, then choose cash or online before adding them to
              inventory.
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft?.map((line, index) => (
                <TableRow key={`${line.name}-${index}`}>
                  <TableCell className="font-medium">{line.name}</TableCell>
                  <TableCell className="text-right">{line.quantity}</TableCell>
                  <TableCell className="text-right">{money(line.price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell />
                <TableCell className="text-right">{money(draftTotal)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <div
            role="radiogroup"
            aria-label="Payment mode"
            className="grid grid-cols-2 gap-2"
          >
            {(["cash", "online"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                variant={mode === option ? "default" : "outline"}
                disabled={saving}
                onClick={() => setMode(option)}
              >
                {paymentModeLabel[option]}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={!mode || saving}
              onClick={() => void confirmAdd()}
            >
              {saving ? "Adding…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PurchaseHistory openId={openPurchaseId} onOpen={setOpenPurchaseId} />
    </div>
  );
}

export default function AddStockPage() {
  return (
    <StockGate adminOnly>
      <AddStockForm />
    </StockGate>
  );
}
