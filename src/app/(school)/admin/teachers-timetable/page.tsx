"use client";

import { Component, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { isSchoolAdmin } from "@/lib/access";
import { mutationResult } from "@/lib/result";
import { PersonField } from "@/components/person-field";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

class TeachersTimetableErrorBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { message: string | null; resetKey: string }
> {
  state = { message: null as string | null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown) {
    return { message: mutationResult(error).message };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { resetKey: string; message: string | null },
  ) {
    if (props.resetKey !== state.resetKey) {
      return { message: null, resetKey: props.resetKey };
    }
    return null;
  }

  render() {
    if (this.state.message) {
      return (
        <p className="text-sm text-destructive">
          Could not load this timetable. {this.state.message}
        </p>
      );
    }
    return this.props.children;
  }
}

function TeachersTimetableBody({
  teacherId,
  onSelect,
}: {
  teacherId: Id<"users"> | "";
  onSelect: (teacherId: Id<"users">) => void;
}) {
  const me = useQuery(api.users.me);
  const allowed = me
    ? isSchoolAdmin(me) || me.staffRole === "incharge"
    : false;
  const teachers = useQuery(
    api.timetables.listTimetableTeachers,
    allowed ? {} : "skip",
  );
  const slots = useQuery(
    api.timetables.listForTeacher,
    allowed && teacherId ? { teacherId } : "skip",
  );

  if (me === undefined || (allowed && teachers === undefined)) {
    return <p className="text-sm text-muted-foreground">Loading timetable…</p>;
  }
  if (me === null) {
    return (
      <p className="text-sm text-destructive">
        Your account is not available. Sign in again.
      </p>
    );
  }
  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        Only super admins, data entry, and incharges can view other teachers&apos;
        timetables.
      </p>
    );
  }

  const selected = (teachers ?? []).find((teacher) => teacher._id === teacherId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly schedule</CardTitle>
        <CardDescription>
          Search for a teacher to see every period they teach or assist.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm space-y-2">
          <Label>Teacher</Label>
          <PersonField
            people={(teachers ?? []).map((teacher) => ({
              id: teacher._id,
              label: teacher.name,
              searchText: teacher.name,
            }))}
            selectedId={teacherId || undefined}
            selectedLabel={selected?.name}
            placeholder="Search teachers"
            searchPlaceholder="Search teachers"
            listLabel="Teachers"
            onSelect={(id) => onSelect(id as Id<"users">)}
          />
        </div>

        {!teacherId ? (
          <p className="text-sm text-muted-foreground">
            Search for a teacher to view their timetable.
          </p>
        ) : slots === undefined ? (
          <p className="text-sm text-muted-foreground">Loading timetable…</p>
        ) : (
          <div className="space-y-3">
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This teacher has no assigned periods.
              </p>
            ) : null}
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
                        const assigned = slots.filter(
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
                                  <p className="text-muted-foreground">
                                    {slot.assignment === "main"
                                      ? "Main teacher"
                                      : "Assistant"}
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TeachersTimetablePage() {
  const [teacherId, setTeacherId] = useState<Id<"users"> | "">("");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Teachers timetable
        </h1>
        <p className="text-sm text-muted-foreground">
          Weekly schedule for any teacher, including assistant periods.
        </p>
      </div>
      <TeachersTimetableErrorBoundary resetKey={teacherId || "none"}>
        <TeachersTimetableBody teacherId={teacherId} onSelect={setTeacherId} />
      </TeachersTimetableErrorBoundary>
    </div>
  );
}
