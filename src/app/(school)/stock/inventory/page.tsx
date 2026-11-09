"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { StockGate, useStockAccess } from "@/components/stock-frame";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function money(value: number) {
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
}

function InventoryList() {
  const { admin } = useStockAccess();
  const rows = useQuery(api.stock.inventory, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          {admin
            ? "Quantity is what remains after stock given to an incharge. Lent is how many are still out on loan. Value is the worth of the quantity still in the office."
            : "Quantity is what you still hold after giving stock to teachers. Lent is how many you still have out on loan. Value is the average price of one item times the quantity you still hold."}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>This list is for viewing only.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows === undefined ? (
            <p className="text-sm text-muted-foreground">Loading inventory…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items in inventory.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Lent</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.itemId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.quantity}</TableCell>
                    <TableCell>{row.lent ?? 0}</TableCell>
                    <TableCell>
                      {row.price === undefined
                        ? "—"
                        : money(Math.round(row.price * row.quantity * 100) / 100)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function InventoryPage() {
  return (
    <StockGate>
      <InventoryList />
    </StockGate>
  );
}
