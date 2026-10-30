"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { isSchoolAdmin } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PersonField } from "@/components/person-field";
import { PickerGroup } from "@/components/picker-group";
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
  const [assistantRows, setAssistantRows] = useState<Record<string, number>>(
    {},
  );
  const slots = useQuery(
    api.timetables.listForClass,
    classId ? { classId } : "skip",
  );
  const upsertSlot = useMutation(api.timetables.upsertSlot);
  const clearSlot = useMutation(api.timetables.clearSlot);
  const isAdmin = me ? isSchoolAdmin(me) : false;
  const isTeacher = me?.role === "teacher";
  const mySlots = useQuery(api.timetables.listMine, isTeacher ? {} : "skip");

  const assignSlot = async (args: {
    dayOfWeek: (typeof DAYS)[number];
    periodNumber: number;
    subjectId: Id<"subjects">;
    teacherId?: Id<"users">;
    assistantTeacherIds?: Id<"users">[];
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
      ...(args.teacherId ? { teacherId: args.teacherId } : {}),
      ...(args.assistantTeacherIds !== undefined
        ? { assistantTeacherIds: args.assistantTeacherIds }
        : {}),
    });
  };

  const unassignSlot = async (
    day: (typeof DAYS)[number],
    period: number,
  ) => {
    if (!classId) {
      toast.error("Select a class first");
      return;
    }
    await clearSlot({
      classId,
      dayOfWeek: day,
      periodNumber: period,
    });
    setAssistantRows((rows) => ({ ...rows, [`${day}-${period}`]: 0 }));
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
            <PickerGroup>
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
                        const cellKey = `${day}-${period}`;
                        const assistantIds =
                          assigned?.assistantTeacherIds ?? [];
                        const visibleAssistants = Math.min(
                          2,
                          Math.max(
                            assistantIds.length,
                            assistantRows[cellKey] ?? 0,
                          ),
                        );
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
                                {assigned.assistantTeacherNames.map(
                                  (name, index) => (
                                    <p
                                      key={`${assigned._id}-assistant-${index}`}
                                      className="text-muted-foreground"
                                    >
                                      {name}
                                    </p>
                                  ),
                                )}
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
                                  onUnassign={async () => {
                                    try {
                                      await unassignSlot(day, period);
                                    } catch (error) {
                                      toast.error(mutationResult(error).message);
                                    }
                                  }}
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
                                <div className="flex items-center gap-1">
                                  <div className="min-w-0 flex-1">
                                    <PersonField
                                      people={(teachers ?? [])
                                        .filter(
                                          (teacher) =>
                                            !(
                                              assigned?.assistantTeacherIds ??
                                              []
                                            ).includes(teacher._id),
                                        )
                                        .map((teacher) => ({
                                          id: teacher._id,
                                          label:
                                            teacher.name ??
                                            teacher.email ??
                                            "Unnamed",
                                          searchText: [
                                            teacher.name,
                                            teacher.email,
                                          ]
                                            .filter(Boolean)
                                            .join(" "),
                                        }))}
                                      selectedId={assigned?.teacherId}
                                      selectedLabel={
                                        assigned?.teacherId
                                          ? assigned.teacherName
                                          : undefined
                                      }
                                      placeholder="Teacher"
                                      searchPlaceholder="Search teachers"
                                      listLabel="Teachers"
                                      onSelect={(teacherId) => {
                                        const subjectId =
                                          assigned?.subjectId ??
                                          subjects?.[0]?._id;
                                        if (!subjectId) {
                                          toast.error("Add a subject first");
                                          return;
                                        }
                                        if (
                                          (
                                            assigned?.assistantTeacherIds ?? []
                                          ).includes(teacherId as Id<"users">)
                                        ) {
                                          toast.error(
                                            "Assistant teacher must be different from the main teacher",
                                          );
                                          return;
                                        }
                                        void assignSlot({
                                          dayOfWeek: day,
                                          periodNumber: period,
                                          subjectId,
                                          teacherId: teacherId as Id<"users">,
                                        }).catch((error) =>
                                          toast.error(
                                            mutationResult(error).message,
                                          ),
                                        );
                                      }}
                                    />
                                  </div>
                                  {visibleAssistants < 2 ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      aria-label="Add assistant teacher"
                                      onClick={() => {
                                        if (!assigned?.subjectId) {
                                          toast.error("Choose a subject first");
                                          return;
                                        }
                                        if (!assigned.teacherId) {
                                          toast.error(
                                            "Choose the main teacher first",
                                          );
                                          return;
                                        }
                                        setAssistantRows((rows) => ({
                                          ...rows,
                                          [cellKey]: visibleAssistants + 1,
                                        }));
                                      }}
                                    >
                                      <Plus />
                                    </Button>
                                  ) : null}
                                </div>
                                {Array.from(
                                  { length: visibleAssistants },
                                  (_, index) => {
                                    const selectedAssistantId =
                                      assistantIds[index];
                                    return (
                                      <div
                                        key={`${cellKey}-assistant-${index}`}
                                        className="flex items-center gap-1"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <PersonField
                                            people={(teachers ?? [])
                                              .filter(
                                                (teacher) =>
                                                  teacher._id !==
                                                    assigned?.teacherId &&
                                                  !assistantIds.some(
                                                    (assistantId, assistantIndex) =>
                                                      assistantIndex !== index &&
                                                      assistantId === teacher._id,
                                                  ),
                                              )
                                              .map((teacher) => ({
                                                id: teacher._id,
                                                label:
                                                  teacher.name ??
                                                  teacher.email ??
                                                  "Unnamed",
                                                searchText: [
                                                  teacher.name,
                                                  teacher.email,
                                                ]
                                                  .filter(Boolean)
                                                  .join(" "),
                                              }))}
                                            selectedId={selectedAssistantId}
                                            selectedLabel={
                                              assigned?.assistantTeacherNames[
                                                index
                                              ]
                                            }
                                            placeholder={
                                              index === 0
                                                ? "Assistant teacher"
                                                : "Second assistant"
                                            }
                                            searchPlaceholder="Search assistant teachers"
                                            listLabel="Assistant teachers"
                                            onSelect={(assistantTeacherId) => {
                                              const subjectId =
                                                assigned?.subjectId;
                                              if (
                                                !subjectId ||
                                                !assigned?.teacherId
                                              ) {
                                                toast.error(
                                                  "Choose the main teacher first",
                                                );
                                                return;
                                              }
                                              const nextId =
                                                assistantTeacherId as Id<"users">;
                                              if (
                                                nextId === assigned.teacherId
                                              ) {
                                                toast.error(
                                                  "Assistant teacher must be different from the main teacher",
                                                );
                                                return;
                                              }
                                              if (
                                                assistantIds.some(
                                                  (assistantId, assistantIndex) =>
                                                    assistantIndex !== index &&
                                                    assistantId === nextId,
                                                )
                                              ) {
                                                toast.error(
                                                  "That assistant is already assigned to this period",
                                                );
                                                return;
                                              }
                                              const next = assistantIds.slice();
                                              next[index] = nextId;
                                              const compact = next.filter(
                                                (id): id is Id<"users"> =>
                                                  id !== undefined,
                                              );
                                              if (compact.length > 2) {
                                                toast.error(
                                                  "A class period can have at most two assistant teachers",
                                                );
                                                return;
                                              }
                                              void assignSlot({
                                                dayOfWeek: day,
                                                periodNumber: period,
                                                subjectId,
                                                teacherId: assigned.teacherId,
                                                assistantTeacherIds: compact,
                                              }).catch((error) =>
                                                toast.error(
                                                  mutationResult(error).message,
                                                ),
                                              );
                                            }}
                                          />
                                        </div>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon"
                                          aria-label={
                                            index === 0
                                              ? "Remove assistant teacher"
                                              : "Remove second assistant teacher"
                                          }
                                          onClick={() => {
                                            const next = assistantIds.filter(
                                              (_, assistantIndex) =>
                                                assistantIndex !== index,
                                            );
                                            setAssistantRows((rows) => ({
                                              ...rows,
                                              [cellKey]: next.length,
                                            }));
                                            if (
                                              !selectedAssistantId ||
                                              !assigned?.subjectId
                                            ) {
                                              return;
                                            }
                                            void assignSlot({
                                              dayOfWeek: day,
                                              periodNumber: period,
                                              subjectId: assigned.subjectId,
                                              teacherId: assigned.teacherId,
                                              assistantTeacherIds: next,
                                            }).catch((error) =>
                                              toast.error(
                                                mutationResult(error).message,
                                              ),
                                            );
                                          }}
                                        >
                                          <Minus />
                                        </Button>
                                      </div>
                                    );
                                  },
                                )}
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
            </PickerGroup>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
