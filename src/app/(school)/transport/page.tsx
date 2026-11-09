"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  transportRouteSchema,
  type TransportRouteInput,
} from "@/lib/schemas";
import { mutationResult } from "@/lib/result";
import { canViewSchoolAdmin, isSchoolAdmin } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";

function money(value: number) {
  return value.toFixed(2);
}

const NO_DRIVERS: { userId: Id<"users">; name: string }[] = [];
const NO_BUSES: { busId: Id<"buses">; name: string; number: string }[] = [];

function sameText(left: string, right: string) {
  return left.trim().toLowerCase().replace(/\s+/g, " ") ===
    right.trim().toLowerCase().replace(/\s+/g, " ");
}

function sameNumber(left: string, right: string) {
  return left.trim().toUpperCase().replace(/\s+/g, " ") ===
    right.trim().toUpperCase().replace(/\s+/g, " ");
}

function uniqueDriverId(
  driverName: string,
  drivers: { userId: Id<"users">; name: string }[],
) {
  const matches = drivers.filter((driver) => sameText(driver.name, driverName));
  return matches.length === 1 ? matches[0].userId : "";
}

function uniqueBusId(
  vehicleNumber: string,
  buses: { busId: Id<"buses">; name: string; number: string }[],
) {
  const matches = buses.filter((bus) => {
    const label = `${bus.name} · ${bus.number}`;
    return sameNumber(bus.number, vehicleNumber) || sameText(label, vehicleNumber);
  });
  return matches.length === 1 ? matches[0].busId : "";
}

export default function TransportPage() {
  const me = useQuery(api.users.me);
  const routes = useQuery(api.transport.listRoutes);
  const choices = useQuery(
    api.transport.routeChoices,
    me && isSchoolAdmin(me) ? {} : "skip",
  );
  const canView = Boolean(me && canViewSchoolAdmin(me));
  const canEdit = Boolean(me && isSchoolAdmin(me));
  const createRoute = useMutation(api.transport.createRoute);
  const updateRoute = useMutation(api.transport.updateRoute);
  const assignStudent = useMutation(api.transport.assignStudent);
  const setCustomFee = useMutation(api.transport.setCustomFee);
  const setStop = useMutation(api.transport.setStop);
  const unassignStudent = useMutation(api.transport.unassignStudent);

  const [routeOpen, setRouteOpen] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<Id<"transportRoutes"> | null>(
    null,
  );
  const [legacyDriver, setLegacyDriver] = useState("");
  const [legacyBus, setLegacyBus] = useState("");
  const [expandedRouteId, setExpandedRouteId] = useState<
    Id<"transportRoutes"> | null
  >(null);
  const [filterRouteId, setFilterRouteId] = useState<Id<"transportRoutes"> | "">(
    "",
  );
  const [customFeeOnly, setCustomFeeOnly] = useState(false);
  const [feeStudentId, setFeeStudentId] = useState<Id<"students"> | null>(null);
  const [customFeeValue, setCustomFeeValue] = useState("");
  const [search, setSearch] = useState("");

  const assignments = useQuery(
    api.transport.listAssignmentsForRoute,
    expandedRouteId ? { routeId: expandedRouteId } : "skip",
  );
  const searchTerm = search.trim();
  const isSearching = searchTerm.length > 0;
  const students = useQuery(
    api.transport.listStudentRows,
    isSearching
      ? { search: searchTerm }
      : filterRouteId
        ? { routeId: filterRouteId, customFeeOnly: customFeeOnly || undefined }
        : "skip",
  );

  const routeForm = useForm<TransportRouteInput>({
    resolver: zodResolver(transportRouteSchema),
    defaultValues: {
      name: "",
      driverId: "",
      busId: "",
      defaultFee: 0,
    },
  });
  const driverId = routeForm.watch("driverId");
  const busId = routeForm.watch("busId");
  const drivers = choices?.drivers ?? NO_DRIVERS;
  const buses = choices?.buses ?? NO_BUSES;
  const driverItems = Object.fromEntries(
    drivers.map((driver) => [driver.userId, driver.name]),
  );
  const busItems = Object.fromEntries(
    buses.map((bus) => [bus.busId, `${bus.name} · ${bus.number}`]),
  );
  const driverPlaceholder =
    choices && drivers.length === 0 ? "No drivers" : "Select driver";
  const busPlaceholder = choices && buses.length === 0 ? "No buses" : "Select bus";

  function closeRouteDialog() {
    setRouteOpen(false);
    setEditingRouteId(null);
    setLegacyDriver("");
    setLegacyBus("");
  }

  function openCreate() {
    setEditingRouteId(null);
    setLegacyDriver("");
    setLegacyBus("");
    routeForm.reset({
      name: "",
      driverId: "",
      busId: "",
      defaultFee: 0,
    });
    setRouteOpen(true);
  }

  function openEdit(route: NonNullable<typeof routes>[number]) {
    const nextDriverId =
      route.driverId && drivers.some((driver) => driver.userId === route.driverId)
        ? route.driverId
        : route.driverId
          ? ""
          : uniqueDriverId(route.driverName, drivers);
    const nextBusId =
      route.busId && buses.some((bus) => bus.busId === route.busId)
        ? route.busId
        : route.busId
          ? ""
          : uniqueBusId(route.vehicleNumber, buses);
    setEditingRouteId(route._id);
    setLegacyDriver(nextDriverId ? "" : route.driverName);
    setLegacyBus(nextBusId ? "" : route.vehicleNumber);
    routeForm.reset({
      name: route.name,
      driverId: nextDriverId,
      busId: nextBusId,
      defaultFee: route.defaultFee,
    });
    setRouteOpen(true);
  }

  useEffect(() => {
    if (!routeOpen || !editingRouteId || !choices || !routes) {
      return;
    }
    const route = routes.find((item) => item._id === editingRouteId);
    if (!route) {
      return;
    }
    if (!routeForm.getValues("driverId")) {
      const matched =
        route.driverId && drivers.some((driver) => driver.userId === route.driverId)
          ? route.driverId
          : route.driverId
            ? ""
            : uniqueDriverId(route.driverName, drivers);
      if (matched) {
        routeForm.setValue("driverId", matched, { shouldValidate: true });
        setLegacyDriver("");
      } else {
        setLegacyDriver(route.driverName);
      }
    }
    if (!routeForm.getValues("busId")) {
      const matched =
        route.busId && buses.some((bus) => bus.busId === route.busId)
          ? route.busId
          : route.busId
            ? ""
            : uniqueBusId(route.vehicleNumber, buses);
      if (matched) {
        routeForm.setValue("busId", matched, { shouldValidate: true });
        setLegacyBus("");
      } else {
        setLegacyBus(route.vehicleNumber);
      }
    }
  }, [routeOpen, editingRouteId, choices, routes, drivers, buses, routeForm]);

  if (me && !canView) {
    return (
      <p className="text-sm text-muted-foreground">
        Only super admins can manage transport routes and fees.
      </p>
    );
  }

  const onSaveRoute = routeForm.handleSubmit(async (values) => {
    try {
      if (editingRouteId) {
        const route = routes?.find((item) => item._id === editingRouteId);
        if (!route) {
          toast.error("Route not found");
          return;
        }
        await updateRoute({
          routeId: editingRouteId,
          name: values.name,
          driverId: values.driverId as Id<"users">,
          busId: values.busId as Id<"buses">,
          defaultFee: values.defaultFee,
          status: route.status,
        });
        toast.success("Route updated");
      } else {
        await createRoute({
          name: values.name,
          driverId: values.driverId as Id<"users">,
          busId: values.busId as Id<"buses">,
          defaultFee: values.defaultFee,
        });
        toast.success("Route created");
      }
      routeForm.reset({
        name: "",
        driverId: "",
        busId: "",
        defaultFee: 0,
      });
      closeRouteDialog();
    } catch (error) {
      toast.error(mutationResult(error).message);
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transport</h1>
          <p className="text-sm text-muted-foreground">
            Manage bus routes, assign students, and override individual fees.
          </p>
        </div>
        {canEdit ? (
          <Button onClick={openCreate}>Create new route</Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Read-only. Observers cannot change routes or assignments.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Routes</CardTitle>
          <CardDescription>
            Expand a route to see assigned students and stops.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {routes === undefined ? (
            <p className="text-sm text-muted-foreground">Loading routes…</p>
          ) : routes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No routes yet. Create the first bus route.
            </p>
          ) : (
            <div className="space-y-2">
              {routes.map((route) => {
                const expanded = expandedRouteId === route._id;
                const driverLabel = route.driverId
                  ? (drivers.find((driver) => driver.userId === route.driverId)
                      ?.name ?? route.driverName)
                  : route.driverName;
                const bus = route.busId
                  ? buses.find((item) => item.busId === route.busId)
                  : undefined;
                const busLabel = bus
                  ? `${bus.name} · ${bus.number}`
                  : route.vehicleNumber;
                return (
                  <div key={route._id} className="rounded-lg border">
                    <div className="flex w-full items-start gap-3 p-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        onClick={() =>
                          setExpandedRouteId(expanded ? null : route._id)
                        }
                      >
                        {expanded ? (
                          <ChevronDown className="mt-0.5 size-4" />
                        ) : (
                          <ChevronRight className="mt-0.5 size-4" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{route.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {driverLabel}
                            {route.driverPhone ? ` · ${route.driverPhone}` : ""} ·{" "}
                            {busLabel} · default {money(route.defaultFee)}
                          </p>
                        </div>
                      </button>
                      {canEdit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(route)}
                      >
                        Edit
                      </Button>
                      ) : null}
                      <Badge variant="secondary">
                        {route.assignedCount} students
                      </Badge>
                    </div>
                    {expanded ? (
                      <div className="border-t p-3">
                        {assignments === undefined ? (
                          <p className="text-sm text-muted-foreground">
                            Loading assignments…
                          </p>
                        ) : assignments.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No students assigned to this route.
                          </p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Student</TableHead>
                                <TableHead>Stop</TableHead>
                                <TableHead>Fee</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {assignments.map((row) => (
                                <TableRow key={row._id}>
                                  <TableCell>
                                    {row.studentName} ({row.admissionNumber})
                                  </TableCell>
                                  <TableCell>{row.stopName ?? "—"}</TableCell>
                                  <TableCell>
                                    {money(row.effectiveFee)}
                                    {row.customFee !== undefined ? (
                                      <Badge className="ml-2" variant="outline">
                                        custom
                                      </Badge>
                                    ) : null}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Student route assignment</CardTitle>
          <CardDescription>
            Assign a route, enter the student stop, and optionally override the
            transport fee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="search">Search students</Label>
              <Input
                id="search"
                value={search}
                placeholder="Name or admission number"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Filter by route</Label>
              <Select
                value={filterRouteId || null}
                items={Object.fromEntries(
                  (routes ?? []).map((route) => [route._id, route.name]),
                )}
                onValueChange={(value) =>
                  setFilterRouteId((value as Id<"transportRoutes">) || "")
                }
              >
                <SelectTrigger className="w-full">
                  <span className="truncate">
                    {(routes ?? []).find((route) => route._id === filterRouteId)
                      ?.name ?? "No route"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {(routes ?? []).map((route) => (
                    <SelectItem key={route._id} value={route._id}>
                      {route.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filterRouteId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setFilterRouteId("")}
                >
                  Clear route filter
                </Button>
              ) : null}
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox
                checked={customFeeOnly}
                disabled={isSearching}
                onCheckedChange={(checked) =>
                  setCustomFeeOnly(checked === true)
                }
              />
              Custom fee applied
            </label>
          </div>

          {isSearching ? (
            <p className="text-xs text-muted-foreground">
              Search shows all enrolled students, including those without a
              route. Route and custom fee filters are ignored while searching.
            </p>
          ) : null}

          {!isSearching && !filterRouteId ? (
            <p className="text-sm text-muted-foreground">
              Select a route to see students, or search by name or admission
              number.
            </p>
          ) : students === undefined ? (
            <p className="text-sm text-muted-foreground">Loading students…</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isSearching
                ? "No enrolled students match this search."
                : "No students match these filters."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Stop</TableHead>
                  <TableHead>Transport fee</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((row) => (
                  <TableRow key={row.studentId}>
                    <TableCell>
                      <div className="font-medium">{row.studentName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.admissionNumber}
                      </div>
                    </TableCell>
                    <TableCell>{row.classLabel}</TableCell>
                    <TableCell>
                      {canEdit ? (
                      <Select
                        value={row.routeId ?? null}
                        onValueChange={(routeId) => {
                          if (!routeId) return;
                          void assignStudent({
                            studentId: row.studentId,
                            routeId: routeId as Id<"transportRoutes">,
                            stopName: row.stopName,
                            customFee: row.customFee,
                          })
                            .then(() => toast.success("Route assigned"))
                            .catch((error) =>
                              toast.error(mutationResult(error).message),
                            );
                        }}
                      >
                        <SelectTrigger className="w-48">
                          <span className="truncate">
                            {row.routeName ?? "Unassigned"}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {(routes ?? []).map((route) => (
                            <SelectItem key={route._id} value={route._id}>
                              {route.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      ) : (
                        <span>{row.routeName ?? "Unassigned"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {canEdit ? (
                      <StudentStopInput
                        disabled={!row.routeId}
                        savedValue={row.stopName ?? ""}
                        onSave={async (stopName) => {
                          try {
                            await setStop({
                              studentId: row.studentId,
                              stopName,
                            });
                            toast.success("Stop saved");
                          } catch (error) {
                            toast.error(mutationResult(error).message);
                          }
                        }}
                      />
                      ) : (
                        <span>{row.stopName || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.effectiveFee !== undefined
                        ? money(row.effectiveFee)
                        : "—"}
                      {row.hasCustomFee ? (
                        <Badge className="ml-2" variant="outline">
                          custom
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      {canEdit ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!row.routeId}
                            onClick={() => {
                              setFeeStudentId(row.studentId);
                              setCustomFeeValue(
                                row.customFee !== undefined
                                  ? String(row.customFee)
                                  : String(row.defaultFee ?? ""),
                              );
                            }}
                          >
                            Custom fee
                          </Button>
                          {row.assignmentId ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                try {
                                  await unassignStudent({
                                    studentId: row.studentId,
                                  });
                                  toast.success("Student unassigned");
                                } catch (error) {
                                  toast.error(mutationResult(error).message);
                                }
                              }}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={routeOpen}
        onOpenChange={(next) => {
          if (next) {
            setRouteOpen(true);
            return;
          }
          closeRouteDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRouteId ? "Edit route" : "Create new route"}
            </DialogTitle>
            <DialogDescription>
              The default flat fee applies until a student has a custom override.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSaveRoute} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="routeName">Route name</Label>
              <Input
                id="routeName"
                placeholder="Route A - City Center"
                {...routeForm.register("name")}
              />
              {routeForm.formState.errors.name ? (
                <p className="text-xs text-destructive">
                  {routeForm.formState.errors.name.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="driverId">Driver</Label>
              <Select
                value={driverId}
                items={driverItems}
                onValueChange={(next) => {
                  if (!next || next === "__no_driver") {
                    return;
                  }
                  routeForm.setValue("driverId", next, { shouldValidate: true });
                  setLegacyDriver("");
                }}
              >
                <SelectTrigger id="driverId" className="w-full">
                  <SelectValue placeholder={driverPlaceholder}>
                    {(value: unknown) => {
                      const key = typeof value === "string" ? value : "";
                      if (key && driverItems[key]) {
                        return driverItems[key];
                      }
                      if (legacyDriver) {
                        return legacyDriver;
                      }
                      return driverPlaceholder;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {choices && drivers.length === 0 ? (
                    <SelectItem value="__no_driver" disabled>
                      No drivers
                    </SelectItem>
                  ) : (
                    drivers.map((driver) => (
                      <SelectItem key={driver.userId} value={driver.userId}>
                        {driver.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {routeForm.formState.errors.driverId ? (
                <p className="text-xs text-destructive">
                  {routeForm.formState.errors.driverId.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="busId">Bus</Label>
              <Select
                value={busId}
                items={busItems}
                onValueChange={(next) => {
                  if (!next || next === "__no_bus") {
                    return;
                  }
                  routeForm.setValue("busId", next, { shouldValidate: true });
                  setLegacyBus("");
                }}
              >
                <SelectTrigger id="busId" className="w-full">
                  <SelectValue placeholder={busPlaceholder}>
                    {(value: unknown) => {
                      const key = typeof value === "string" ? value : "";
                      if (key && busItems[key]) {
                        return busItems[key];
                      }
                      if (legacyBus) {
                        return legacyBus;
                      }
                      return busPlaceholder;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {choices && buses.length === 0 ? (
                    <SelectItem value="__no_bus" disabled>
                      No buses
                    </SelectItem>
                  ) : (
                    buses.map((bus) => (
                      <SelectItem key={bus.busId} value={bus.busId}>
                        {bus.name} · {bus.number}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {routeForm.formState.errors.busId ? (
                <p className="text-xs text-destructive">
                  {routeForm.formState.errors.busId.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultFee">Default route flat fee</Label>
              <Input
                id="defaultFee"
                type="number"
                step="0.01"
                min="0"
                {...routeForm.register("defaultFee")}
              />
              {routeForm.formState.errors.defaultFee ? (
                <p className="text-xs text-destructive">
                  {routeForm.formState.errors.defaultFee.message}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeRouteDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={routeForm.formState.isSubmitting}
              >
                {routeForm.formState.isSubmitting ? "Saving…" : "Save route"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={feeStudentId !== null}
        onOpenChange={(next) => {
          if (!next) setFeeStudentId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom transportation fee</DialogTitle>
            <DialogDescription>
              This amount replaces the route default for this student only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="customFee">Custom fee</Label>
            <Input
              id="customFee"
              type="number"
              step="0.01"
              min="0"
              value={customFeeValue}
              onChange={(event) => setCustomFeeValue(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!feeStudentId) return;
                try {
                  await setCustomFee({
                    studentId: feeStudentId,
                    customFee: null,
                  });
                  toast.success("Custom fee cleared");
                  setFeeStudentId(null);
                } catch (error) {
                  toast.error(mutationResult(error).message);
                }
              }}
            >
              Use route default
            </Button>
            <Button
              onClick={async () => {
                if (!feeStudentId) return;
                const amount = Number(customFeeValue);
                if (!Number.isFinite(amount) || amount < 0) {
                  toast.error("Enter a valid fee");
                  return;
                }
                try {
                  await setCustomFee({
                    studentId: feeStudentId,
                    customFee: amount,
                  });
                  toast.success("Custom fee saved");
                  setFeeStudentId(null);
                } catch (error) {
                  toast.error(mutationResult(error).message);
                }
              }}
            >
              Save override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StudentStopInput({
  disabled,
  savedValue,
  onSave,
}: {
  disabled: boolean;
  savedValue: string;
  onSave: (stopName: string) => Promise<void>;
}) {
  const [value, setValue] = useState(savedValue);

  useEffect(() => {
    setValue(savedValue);
  }, [savedValue]);

  async function persist(nextRaw?: string) {
    if (disabled) return;
    const next = (nextRaw ?? value).trim();
    if (next === savedValue.trim()) return;
    await onSave(next);
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label="Student stop"
        className="w-44"
        disabled={disabled}
        placeholder={disabled ? "Assign a route first" : "Enter stop"}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={(event) => {
          void persist(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void persist(event.currentTarget.value);
          }
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || value.trim() === savedValue.trim()}
        onClick={() => {
          void persist();
        }}
      >
        Save
      </Button>
    </div>
  );
}
