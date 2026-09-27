"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { Label } from "@/components/ui/label";
import { SubjectField } from "@/components/subject-field";
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

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function TimetablePage() {
  const me = useQuery(api.users.me);
  const classes = useQuery(api.catalog.listClasses);
  const subjects = useQuery(api.catalog.listSubjects);
  const teachers = useQuery(
    api.timetables.listTeachers,
    me?.role === "super_admin" || me?.role === "teacher" ? {} : "skip",
  );
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const slots = useQuery(
    api.timetables.listForClass,
    classId ? { classId } : "skip",
  );
  const upsertSlot = useMutation(api.timetables.upsertSlot);
  const isAdmin = me?.role === "super_admin";
  const isTeacher = me?.role === "teacher";
  const mySlots = useQuery(api.timetables.listMine, isTeacher ? {} : "skip");

  const assignSlot = async (args: {
    dayOfWeek: (typeof DAYS)[number];
    periodNumber: number;
    subjectId: Id<"subjects">;
    teacherId?: Id<"users">;
  }) => {
    if (!classId) {
      toast.error("Select a class first");
      return;
    }
    await upsertSlot({
      classId,
      dayOfWeek: args.dayOfWeek,
      periodNumber: args.periodNumber,
      subjectId: args.subjectId,
      teacherId: args.teacherId,
    });
  };

  const cell = (day: (typeof DAYS)[number], period: number) =>
    slots?.find((slot) => slot.dayOfWeek === day && slot.periodNumber === period);

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading timetable…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Timetable</h1>
        <p className="text-sm text-muted-foreground">
          {isTeacher
            ? "Your classes for the week, by day and period."
            : "Weekly grid by class, day, and period."}
        </p>
      </div>
      {isTeacher ? (
        <Card>
          <CardHeader>
            <CardTitle>Your schedule</CardTitle>
            <CardDescription>
              Each cell is the class you go to for that period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mySlots === undefined ? (
              <p className="text-sm text-muted-foreground">Loading timetable…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border bg-muted/40 p-2 text-left">Period</th>
                      {DAYS.map((day) => (
                        <th
                          key={day}
                          className="border bg-muted/40 p-2 text-left capitalize"
                        >
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODS.map((period) => (
                      <tr key={period}>
                        <td className="border p-2 font-medium">{period}</td>
                        {DAYS.map((day) => {
                          const assigned = (mySlots ?? []).filter(
                            (slot) =>
                              slot.dayOfWeek === day &&
                              slot.periodNumber === period,
                          );
                          return (
                            <td key={day} className="border p-2 align-top">
                              {assigned.length === 0 ? (
                                <p className="text-muted-foreground">Free</p>
                              ) : (
                                assigned.map((slot) => (
                                  <div key={slot._id} className="mb-2 last:mb-0">
                                    <p className="font-medium">{slot.classLabel}</p>
                                    <p className="text-muted-foreground">
                                      {slot.subjectName}
                                    </p>
                                  </div>
                                ))
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle>Weekly schedule</CardTitle>
          <CardDescription>
            Super admins can assign a subject and teacher to each cell.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm space-y-2">
            <Label>Class</Label>
            <Select
              value={classId || null}
              items={Object.fromEntries(
                (classes ?? []).map((classroom) => [
                  classroom._id,
                  `${classroom.name} ${classroom.section}`.trim(),
                ]),
              )}
              onValueChange={(value) => {
                if (value) setClassId(value as Id<"classes">);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((classroom) => (
                  <SelectItem key={classroom._id} value={classroom._id}>
                    {classroom.name} {classroom.section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!classId ? (
            <p className="text-sm text-muted-foreground">
              Choose a class to view its timetable.
            </p>
          ) : slots === undefined ? (
            <p className="text-sm text-muted-foreground">Loading timetable…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border bg-muted/40 p-2 text-left">Period</th>
                    {DAYS.map((day) => (
                      <th
                        key={day}
                        className="border bg-muted/40 p-2 text-left capitalize"
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((period) => (
                    <tr key={period}>
                      <td className="border p-2 font-medium">{period}</td>
                      {DAYS.map((day) => {
                        const assigned = cell(day, period);
                        return (
                          <td key={day} className="border p-2 align-top">
                            {assigned ? (
                              <div>
                                <p className="font-medium">
                                  {assigned.subjectName}
                                </p>
                                <p className="text-muted-foreground">
                                  {assigned.teacherName}
                                </p>
                              </div>
                            ) : (
                              <p className="text-muted-foreground">Free</p>
                            )}
                            {isAdmin ? (
                              <div className="mt-2 space-y-2">
                                <SubjectField
                                  subjects={subjects ?? []}
                                  selectedId={assigned?.subjectId}
                                  selectedName={assigned?.subjectName}
                                  onSelect={async (subjectId) => {
                                    try {
                                      await assignSlot({
                                        dayOfWeek: day,
                                        periodNumber: period,
                                        subjectId,
                                        teacherId: assigned?.teacherId,
                                      });
                                    } catch (error) {
                                      toast.error(mutationResult(error).message);
                                    }
                                  }}
                                />
                                <Select
                                  value={assigned?.teacherId ?? null}
                                  onValueChange={(teacherId) => {
                                    if (!teacherId) return;
                                    const subjectId =
                                      assigned?.subjectId ?? subjects?.[0]?._id;
                                    if (!subjectId) {
                                      toast.error("Add a subject first");
                                      return;
                                    }
                                    void assignSlot({
                                      dayOfWeek: day,
                                      periodNumber: period,
                                      subjectId,
                                      teacherId: teacherId as Id<"users">,
                                    }).catch((error) =>
                                      toast.error(mutationResult(error).message),
                                    );
                                  }}
                                >
                                  <SelectTrigger className="w-full">
                                    <span className="flex flex-1 truncate text-left">
                                      {assigned?.teacherName ?? "Teacher"}
                                    </span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(teachers ?? []).map((teacher) => (
                                      <SelectItem
                                        key={teacher._id}
                                        value={teacher._id}
                                      >
                                        {teacher.name ?? teacher.email}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
