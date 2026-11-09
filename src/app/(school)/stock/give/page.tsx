"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { cn } from "@/lib/utils";
import { StockGate, StockTabs, useStockAccess } from "@/components/stock-frame";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function GiveForm() {
  const options = useQuery(api.stock.giveOptions, {});
  const give = useMutation(api.stock.give);
  const [itemId, setItemId] = useState("");
  const [personId, setPersonId] = useState("");
  const [mode, setMode] = useState<"give" | "lend">("give");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const itemItems = Object.fromEntries(
    (options?.items ?? []).map((item) => [
      item.itemId,
      `${item.name} (${item.quantity})`,
    ]),
  );
  const peopleItems = Object.fromEntries(
    (options?.people ?? []).map((person) => [person.userId, person.name]),
  );
  const recipientLabel =
    options?.givesTo === "teacher" ? "Teacher" : "Incharge";

  async function onGive() {
    const amount = Number(quantity);
    if (!itemId || !personId || !Number.isInteger(amount)) {
      toast.error("Choose an item and a person, and enter a whole quantity");
      return;
    }
    setSaving(true);
    try {
      await give({
        itemId: itemId as Id<"stockItems">,
        toUserId: personId as Id<"users">,
        quantity: amount,
        mode,
        date,
        ...(note.trim() ? { note } : {}),
      });
      toast.success(mode === "lend" ? "Item lent" : "Item given");
      setQuantity("");
      setNote("");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Give</h1>
          <p className="text-sm text-muted-foreground">
            {options?.givesTo === "teacher"
              ? "Give or lend items from your stock to a teacher. Lent items are returned."
              : "Give or lend office inventory to an incharge. Lent items are returned."}
          </p>
        </div>
        <StockTabs />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{mode === "lend" ? "Lend item" : "Give item"}</CardTitle>
          <CardDescription>
            Quantity leaves {options?.givesTo === "teacher" ? "your stock" : "inventory"}{" "}
            when this is saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-4">
          {options === undefined ? (
            <p className="text-sm text-muted-foreground">Loading stock…</p>
          ) : (
            <>
              <div
                className="inline-flex w-fit rounded-lg bg-muted p-[3px]"
                role="radiogroup"
                aria-label="Give or lend"
              >
                {(["give", "lend"] as const).map((value) => {
                  const selected = mode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={cn(
                        "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                        selected
                          ? value === "give"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-red-600 text-white shadow-sm"
                          : "text-foreground/60 hover:text-foreground",
                      )}
                      onClick={() => setMode(value)}
                    >
                      {value === "give" ? "Give" : "Lend"}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2">
                <Label htmlFor="give-item">Item</Label>
                <Select
                  value={itemId}
                  items={itemItems}
                  onValueChange={(next) => {
                    if (next) {
                      setItemId(next);
                    }
                  }}
                >
                  <SelectTrigger id="give-item" className="w-full">
                    <SelectValue placeholder="Select an item" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.items.map((item) => (
                      <SelectItem key={item.itemId} value={item.itemId}>
                        {item.name} ({item.quantity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="give-person">{recipientLabel}</Label>
                <Select
                  value={personId}
                  items={peopleItems}
                  onValueChange={(next) => {
                    if (next) {
                      setPersonId(next);
                    }
                  }}
                >
                  <SelectTrigger id="give-person" className="w-full">
                    <SelectValue placeholder={`Select ${recipientLabel.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.people.map((person) => (
                      <SelectItem key={person.userId} value={person.userId}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="give-quantity">Quantity</Label>
                  <Input
                    id="give-quantity"
                    inputMode="numeric"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="give-date">Date</Label>
                  <Input
                    id="give-date"
                    type="date"
                    value={date}
                    max={todayIso()}
                    onChange={(event) => {
                      if (event.target.value) {
                        setDate(event.target.value);
                      }
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="give-note">Note</Label>
                <Input
                  id="give-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              <Button
                type="button"
                disabled={saving || options.items.length === 0 || options.people.length === 0}
                onClick={() => void onGive()}
              >
                {saving ? "Saving…" : mode === "lend" ? "Lend" : "Give"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GiveStockBody() {
  const { readOnly } = useStockAccess();
  if (readOnly) {
    return (
      <p className="text-sm text-muted-foreground">
        Read-only. Observers cannot give or lend stock.
      </p>
    );
  }
  return <GiveForm />;
}

export default function GiveStockPage() {
  return (
    <StockGate>
      <GiveStockBody />
    </StockGate>
  );
}
