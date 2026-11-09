"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { canViewSchoolAdmin, isSchoolAdmin } from "@/lib/access";
import { mutationResult } from "@/lib/result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function money(value: number) {
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
}

function formatDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export default function FuelPage() {
  const me = useQuery(api.users.me);
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const allowed = me ? canViewSchoolAdmin(me) : false;
  const canEdit = me ? isSchoolAdmin(me) : false;
  const overview = useQuery(
    api.fuel.overview,
    allowed ? { month } : "skip",
  );
  const addBus = useMutation(api.fuel.addBus);
  const recordFuel = useMutation(api.fuel.recordFuel);

  const [busName, setBusName] = useState("");
  const [busNumber, setBusNumber] = useState("");
  const [busOdometer, setBusOdometer] = useState("");
  const [addingBus, setAddingBus] = useState(false);

  const [busId, setBusId] = useState("");
  const [date, setDate] = useState(todayIso);
  const [odometer, setOdometer] = useState("");
  const [liters, setLiters] = useState("");
  const [price, setPrice] = useState("");
  const [savingFuel, setSavingFuel] = useState(false);

  const busItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const bus of overview?.buses ?? []) {
      items[bus.busId] = `${bus.name} · ${bus.number}`;
    }
    return items;
  }, [overview?.buses]);

  const chart = useMemo(() => {
    const rows = (overview?.buses ?? []).filter((bus) => bus.monthExpense > 0);
    const max = rows.reduce((highest, bus) => Math.max(highest, bus.monthExpense), 0);
    return { rows, max };
  }, [overview?.buses]);

  async function onAddBus() {
    const reading = parseNumber(busOdometer);
    if (!busName.trim() || !busNumber.trim() || !Number.isFinite(reading)) {
      toast.error("Enter the bus name, number, and odometer reading");
      return;
    }
    setAddingBus(true);
    try {
      await addBus({
        name: busName,
        number: busNumber,
        odometer: reading,
      });
      toast.success("Bus added");
      setBusName("");
      setBusNumber("");
      setBusOdometer("");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setAddingBus(false);
    }
  }

  async function onRecordFuel() {
    const reading = parseNumber(odometer);
    const fuel = parseNumber(liters);
    const amount = parseNumber(price);
    if (!busId) {
      toast.error("Select a bus");
      return;
    }
    if (!date || !Number.isFinite(reading) || !Number.isFinite(fuel) || !Number.isFinite(amount)) {
      toast.error("Enter the odometer, litres, and price");
      return;
    }
    setSavingFuel(true);
    try {
      await recordFuel({
        busId: busId as Id<"buses">,
        date,
        odometer: reading,
        liters: fuel,
        price: amount,
      });
      toast.success("Fuel recorded");
      setOdometer("");
      setLiters("");
      setPrice("");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSavingFuel(false);
    }
  }

  if (me === undefined || (allowed && overview === undefined)) {
    return <p className="text-sm text-muted-foreground">Loading fuel records…</p>;
  }
  if (me === null) {
    return (
      <p className="text-sm text-destructive">
        Your account is not available. Sign in again.
      </p>
    );
  }
  if (!allowed || overview === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        Only super admins and data entry can record fuel.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fuel</h1>
          <p className="text-sm text-muted-foreground">
            Record fuel added to each bus. Mileage is the kilometres since the
            previous reading, divided by the litres filled.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fuel-month">Month</Label>
          <Input
            id="fuel-month"
            type="month"
            value={month}
            onChange={(event) => {
              if (event.target.value) {
                setMonth(event.target.value);
              }
            }}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fuel expense</CardTitle>
          <CardDescription>
            {money(overview.monthTotal)} spent this month
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chart.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No fuel expense recorded for this month.
            </p>
          ) : (
            <div className="flex h-64 items-end gap-4 overflow-x-auto border-b pt-2">
              {chart.rows.map((bus) => {
                const height = Math.max(8, (bus.monthExpense / chart.max) * 200);
                return (
                  <div
                    key={bus.busId}
                    className="flex min-w-16 flex-1 flex-col items-center justify-end gap-2"
                  >
                    <span className="text-xs font-medium">
                      {money(bus.monthExpense)}
                    </span>
                    <div
                      className="w-full max-w-16 rounded-t-md bg-primary"
                      style={{ height }}
                      title={`${bus.name}: ${money(bus.monthExpense)}`}
                    />
                    <span className="max-w-24 truncate text-center text-xs text-muted-foreground">
                      {bus.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {canEdit ? (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add bus</CardTitle>
            <CardDescription>
              Name, number, and the odometer reading before the next fill.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="bus-name">Bus name</Label>
              <Input
                id="bus-name"
                value={busName}
                onChange={(event) => setBusName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bus-number">Bus number</Label>
              <Input
                id="bus-number"
                value={busNumber}
                onChange={(event) => setBusNumber(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bus-odometer">Odometer reading</Label>
              <Input
                id="bus-odometer"
                inputMode="decimal"
                value={busOdometer}
                onChange={(event) => setBusOdometer(event.target.value)}
              />
            </div>
            <Button type="button" disabled={addingBus} onClick={() => void onAddBus()}>
              {addingBus ? "Adding…" : "Add bus"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Record fuel</CardTitle>
            <CardDescription>
              Enter the latest odometer reading, the litres added, and the price
              paid.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="fuel-bus">Bus</Label>
              <Select
                value={busId}
                items={busItems}
                onValueChange={(next) => {
                  if (next) {
                    setBusId(next as Id<"buses">);
                  }
                }}
              >
                <SelectTrigger id="fuel-bus" className="w-full">
                  <SelectValue placeholder="Select a bus" />
                </SelectTrigger>
                <SelectContent>
                  {(overview.buses ?? []).map((bus) => (
                    <SelectItem key={bus.busId} value={bus.busId}>
                      {bus.name} · {bus.number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuel-date">Date</Label>
              <Input
                id="fuel-date"
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fuel-odometer">Odometer</Label>
                <Input
                  id="fuel-odometer"
                  inputMode="decimal"
                  value={odometer}
                  onChange={(event) => setOdometer(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fuel-liters">Litres</Label>
                <Input
                  id="fuel-liters"
                  inputMode="decimal"
                  value={liters}
                  onChange={(event) => setLiters(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fuel-price">Price (₹)</Label>
                <Input
                  id="fuel-price"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              disabled={savingFuel || overview.buses.length === 0}
              onClick={() => void onRecordFuel()}
            >
              {savingFuel ? "Saving…" : "Record fuel"}
            </Button>
          </CardContent>
        </Card>
      </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Read-only. Observers cannot add buses or record fuel.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Buses</CardTitle>
          <CardDescription>
            Mileage is kilometres per litre since the bus was added.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overview.buses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No buses yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bus</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Odometer</TableHead>
                  <TableHead>Mileage</TableHead>
                  <TableHead>This month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.buses.map((bus) => (
                  <TableRow key={bus.busId}>
                    <TableCell className="font-medium">{bus.name}</TableCell>
                    <TableCell>{bus.number}</TableCell>
                    <TableCell>{bus.odometer.toLocaleString("en-IN")} km</TableCell>
                    <TableCell>
                      {bus.mileage === null ? "—" : `${bus.mileage.toFixed(2)} km/L`}
                    </TableCell>
                    <TableCell>{money(bus.monthExpense)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fills this month</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.fills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No fuel recorded for this month.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Bus</TableHead>
                  <TableHead>Odometer</TableHead>
                  <TableHead>Litres</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Mileage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.fills.map((fill) => (
                  <TableRow key={fill.fillId}>
                    <TableCell>{formatDay(fill.date)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{fill.busName}</div>
                      <div className="text-xs text-muted-foreground">
                        {fill.busNumber}
                      </div>
                    </TableCell>
                    <TableCell>{fill.odometer.toLocaleString("en-IN")} km</TableCell>
                    <TableCell>{fill.liters}</TableCell>
                    <TableCell>{money(fill.price)}</TableCell>
                    <TableCell>
                      {fill.mileage === null
                        ? "—"
                        : `${fill.mileage.toFixed(2)} km/L`}
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
