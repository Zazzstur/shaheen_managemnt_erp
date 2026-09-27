"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function TransportPage() {
  const me = useQuery(api.users.me);
  const routes = useQuery(api.transport.listRoutes);
  const createRoute = useMutation(api.transport.createRoute);
  const assignStudent = useMutation(api.transport.assignStudent);
  const setCustomFee = useMutation(api.transport.setCustomFee);
  const setStop = useMutation(api.transport.setStop);
  const unassignStudent = useMutation(api.transport.unassignStudent);

  const [routeOpen, setRouteOpen] = useState(false);
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
  const students = useQuery(api.transport.listStudentRows, {
    routeId: filterRouteId || undefined,
    customFeeOnly: customFeeOnly || undefined,
  });

  const routeForm = useForm<TransportRouteInput>({
    resolver: zodResolver(transportRouteSchema),
    defaultValues: {
      name: "",
      driverName: "",
      vehicleNumber: "",
      defaultFee: 0,
    },
  });

  const visibleStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !students) return students;
    return students.filter(
      (row) =>
        row.studentName.toLowerCase().includes(term) ||
        row.admissionNumber.toLowerCase().includes(term) ||
        row.classLabel.toLowerCase().includes(term),
    );
  }, [students, search]);

  if (me && me.role !== "super_admin") {
    return (
      <p className="text-sm text-muted-foreground">
        Only super admins can manage transport routes and fees.
      </p>
    );
  }

  const onCreateRoute = routeForm.handleSubmit(async (values) => {
    try {
      await createRoute(values);
      toast.success("Route created");
      routeForm.reset();
      setRouteOpen(false);
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
        <Button
          onClick={() => {
            routeForm.reset();
            setRouteOpen(true);
          }}
        >
          Create new route
        </Button>
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
                return (
                  <div key={route._id} className="rounded-lg border">
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 p-3 text-left"
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
                          {route.driverName} · {route.vehicleNumber} · default{" "}
                          {money(route.defaultFee)}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {route.assignedCount} students
                      </Badge>
                    </button>
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
                      ?.name ?? "All routes"}
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
                onCheckedChange={(checked) =>
                  setCustomFeeOnly(checked === true)
                }
              />
              Custom fee applied
            </label>
          </div>

          {students === undefined ? (
            <p className="text-sm text-muted-foreground">Loading students…</p>
          ) : visibleStudents?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No students match these filters.
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
                {(visibleStudents ?? []).map((row) => (
                  <TableRow key={row.studentId}>
                    <TableCell>
                      <div className="font-medium">{row.studentName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.admissionNumber}
                      </div>
                    </TableCell>
                    <TableCell>{row.classLabel}</TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new route</DialogTitle>
            <DialogDescription>
              The default flat fee applies until a student has a custom override.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreateRoute} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="routeName">Route name</Label>
              <Input
                id="routeName"
                placeholder="Route A - City Center"
                {...routeForm.register("name")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driverName">Driver name</Label>
              <Input id="driverName" {...routeForm.register("driverName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicleNumber">Vehicle number</Label>
              <Input
                id="vehicleNumber"
                {...routeForm.register("vehicleNumber")}
              />
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
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRouteOpen(false)}
              >
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
