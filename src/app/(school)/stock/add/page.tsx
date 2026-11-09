"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { StockGate } from "@/components/stock-frame";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

function AddStockForm() {
  const addItem = useMutation(api.stock.addItem);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const term = name.trim();
  const key = productKey(name);
  const matches = useQuery(
    api.stock.searchItems,
    key ? { term } : "skip",
  );
  const exact = matches?.find((item) => productKey(item.name) === key);

  async function onAdd() {
    const amount = Number(quantity);
    const totalPrice = Number(price);
    if (!term || !Number.isInteger(amount) || !Number.isFinite(totalPrice)) {
      toast.error("Enter a product name, a whole quantity, and the total price");
      return;
    }
    setSaving(true);
    try {
      await addItem({ name: term, quantity: amount, price: totalPrice });
      toast.success(exact ? "Stock added to the existing product" : "Product created");
      setName("");
      setQuantity("");
      setPrice("");
      setOpen(false);
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add stock</h1>
        <p className="text-sm text-muted-foreground">
          Search for a product. A new name is created. An existing name adds to
          that product.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Product</CardTitle>
          <CardDescription>
            Name, how many are being added, and the total price paid for that quantity.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-md gap-4">
          <div className="space-y-2">
            <Label htmlFor="stock-name">Product name</Label>
            <Input
              id="stock-name"
              role="combobox"
              aria-expanded={open}
              aria-controls="stock-name-list"
              autoComplete="off"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
            />
            {open && term && matches ? (
              <div
                id="stock-name-list"
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
                      onClick={() => {
                        setName(item.name);
                        setOpen(false);
                      }}
                    >
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.quantity} in stock
                        {item.price === undefined
                          ? ""
                          : ` · ${money(Math.round(item.price * item.quantity * 100) / 100)}`}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
            {exact ? (
              <p className="text-xs text-muted-foreground">
                Already in inventory: {exact.quantity} in stock
                {exact.price === undefined
                  ? ". "
                  : `, worth ${money(Math.round(exact.price * exact.quantity * 100) / 100)}. `}
                Enter the total price for the quantity you are adding.
              </p>
            ) : term && matches && matches.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                This name is not in inventory yet.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-quantity">Quantity</Label>
            <Input
              id="stock-quantity"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-price">Total price (₹)</Label>
            <Input
              id="stock-price"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>
          <Button type="button" disabled={saving} onClick={() => void onAdd()}>
            {saving ? "Adding…" : exact ? "Add to existing product" : "Add stock"}
          </Button>
        </CardContent>
      </Card>
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
