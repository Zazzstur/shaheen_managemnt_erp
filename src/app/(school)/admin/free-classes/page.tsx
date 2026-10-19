"use client";

import { Component, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { XIcon } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { isSchoolAdmin } from "@/lib/access";
import { mutationResult } from "@/lib/result";
import { PickerGroup } from "@/components/picker-group";
import {
  SearchOption,
  SearchPopover,
  textMatches,
} from "@/components/search-popover";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const NO_COVER = "none";

function teacherMatches(
  teacher: { name: string; email?: string },
  query: string,
) {
  if (!query.trim()) return false;
  return textMatches([teacher.name, teacher.email], query);
}

function isAssistantCover(option: {
  group?: "free" | "assistant";
  label: string;
}) {
  if (option.group === "assistant") return true;
  if (option.group === "free") return false;
  return /\(assisting [^)]+\)/.test(option.label);
}

function coverOptionMatches(
  option: { label: string },
  teacher: { name: string; email?: string } | undefined,
  query: string,
) {
  return textMatches([option.label, teacher?.name, teacher?.email], query);
}

function CoverSelect({
  timetableId,
  coverTeacherId,
  options,
  teachers,
  disabled,
  onCover,
}: {
  timetableId: Id<"timetables">;
  coverTeacherId?: Id<"users">;
  options: {
    teacherId: Id<"users">;
    label: string;
    group?: "free" | "assistant";
  }[];
  teachers: { _id: Id<"users">; name: string; email?: string }[];
  disabled: boolean;
  onCover: (timetableId: Id<"timetables">, value: string | null) => void;
}) {
  const teacherById = useMemo(
    () => new Map(teachers.map((teacher) => [teacher._id, teacher])),
    [teachers],
  );
  const selected = options.find((option) => option.teacherId === coverTeacherId);
  const freeCount = options.filter((option) => !isAssistantCover(option)).length;
  const assistantCount = options.length - freeCount;

  return (
    <SearchPopover
      triggerLabel={selected?.label}
      placeholder="No cover"
      listLabel="Cover teachers"
      inputLabel="Search cover teachers"
      disabled={disabled}
      triggerClassName="min-w-48"
    >
      {(query, close) => {
        const visible = options.filter((option) =>
          coverOptionMatches(option, teacherById.get(option.teacherId), query),
        );
        const freeTeachers = visible.filter((option) => !isAssistantCover(option));
        const assistantTeachers = visible.filter((option) =>
          isAssistantCover(option),
        );
        const choose = (value: string) => {
          void onCover(timetableId, value);
          close();
        };
        return (
          <>
            <SearchOption
              label="No cover"
              selected={!coverTeacherId}
              onClick={() => choose(NO_COVER)}
            />
            <div className="my-1 h-px bg-border" />
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              Free teachers
            </p>
            {freeTeachers.length === 0 ? (
              <p className="px-1.5 py-1 text-xs text-muted-foreground">
                {freeCount === 0 ? "None" : "No matches."}
              </p>
            ) : (
              freeTeachers.map((option) => (
                <SearchOption
                  key={option.teacherId}
                  label={option.label}
                  selected={option.teacherId === coverTeacherId}
                  onClick={() => choose(option.teacherId)}
                />
              ))
            )}
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              Assistant teachers
            </p>
            {assistantTeachers.length === 0 ? (
              <p className="px-1.5 py-1 text-xs text-muted-foreground">
                {assistantCount === 0 ? "None" : "No matches."}
              </p>
            ) : (
              assistantTeachers.map((option) => (
                <SearchOption
                  key={option.teacherId}
                  label={option.label}
                  selected={option.teacherId === coverTeacherId}
                  onClick={() => choose(option.teacherId)}
                />
              ))
            )}
          </>
        );
      }}
    </SearchPopover>
  );
}

function todayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

class FreeClassesErrorBoundary extends Component<
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
          Could not load free classes. {this.state.message}
        </p>
      );
    }
    return this.props.children;
  }
}

function FreeClassesBody({ date }: { date: string }) {
  const me = useQuery(api.users.me);
  const allowed = me ? isSchoolAdmin(me) : false;
  const data = useQuery(api.freeClasses.forDate, allowed ? { date } : "skip");
  const setAbsence = useMutation(api.freeClasses.setAbsence);
  const setCover = useMutation(api.freeClasses.setCover);
  const [savingTeacherId, setSavingTeacherId] = useState<Id<"users"> | null>(
    null,
  );
  const [savingSlotId, setSavingSlotId] = useState<Id<"timetables"> | null>(
    null,
  );
  const teachers = data?.teachers;

  if (me === undefined || (allowed && data === undefined)) {
    return <p className="text-sm text-muted-foreground">Loading free classes…</p>;
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
        Only super admins and data entry can open free classes.
      </p>
    );
  }
  if (!data) {
    return (
      <p className="text-sm text-destructive">
        Could not load free classes.
      </p>
    );
  }

  const absentTeachers = data.teachers.filter((teacher) => teacher.absent);
  const absentCount = absentTeachers.length;

  async function onAbsence(teacherId: Id<"users">, absent: boolean) {
    setSavingTeacherId(teacherId);
    try {
      await setAbsence({ date, teacherId, absent });
      return true;
    } catch (error) {
      toast.error(mutationResult(error).message);
      return false;
    } finally {
      setSavingTeacherId(null);
    }
  }

  async function onCover(timetableId: Id<"timetables">, value: string | null) {
    if (!value) {
      return;
    }
    setSavingSlotId(timetableId);
    try {
      await setCover(
        value === NO_COVER
          ? { date, timetableId, clearCover: true }
          : { date, timetableId, coverTeacherId: value as Id<"users"> },
      );
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSavingSlotId(null);
    }
  }

  return (
    <PickerGroup>
    <div className="space-y-6">
      <div className="max-w-sm space-y-2">
        <Label htmlFor="absent-teacher-search">Search teachers</Label>
        <SearchPopover
          triggerId="absent-teacher-search"
          placeholder="Search teachers"
          listLabel="Teachers"
          inputLabel="Search teachers"
        >
          {(search, close) => {
            const found = (teachers ?? []).filter((teacher) =>
              teacherMatches(teacher, search),
            );
            const available = found.filter((teacher) => !teacher.absent);
            if (!search.trim()) {
              return (
                <p className="px-1.5 py-1 text-xs text-muted-foreground">
                  Type a name to search.
                </p>
              );
            }
            if (data.teachers.length === 0) {
              return (
                <p className="px-1.5 py-1 text-xs text-muted-foreground">
                  No teachers found.
                </p>
              );
            }
            if (available.length === 0) {
              return (
                <p className="px-1.5 py-1 text-xs text-muted-foreground">
                  {found.length > 0 ? "Already marked absent." : "No matches."}
                </p>
              );
            }
            return available.map((teacher) => (
              <SearchOption
                key={teacher._id}
                label={teacher.name}
                description={
                  teacher.email &&
                  teacher.email.localeCompare(teacher.name, undefined, {
                    sensitivity: "accent",
                  }) !== 0
                    ? teacher.email
                    : undefined
                }
                disabled={savingTeacherId === teacher._id}
                onClick={() => {
                  void (async () => {
                    const saved = await onAbsence(teacher._id, true);
                    if (saved) close();
                  })();
                }}
              />
            ));
          }}
        </SearchPopover>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Absent teachers</CardTitle>
          <CardDescription>
            Choose who is absent on this date. A period is free only when the
            absent person is the main teacher.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.teachers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teachers found.</p>
          ) : absentTeachers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No absent teachers yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {absentTeachers.map((teacher) => (
                <li
                  key={teacher._id}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm"
                >
                  <span className="min-w-0 truncate">{teacher.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${teacher.name}`}
                    disabled={savingTeacherId === teacher._id}
                    onClick={() => {
                      void onAbsence(teacher._id, false);
                    }}
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Free periods</CardTitle>
          <CardDescription>
            {data.weekday === null
              ? "Sunday has no timetable."
              : absentCount === 0
                ? "Select the teachers who are absent."
                : "Assign a teacher who is free, or who is only assisting, in that period."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.weekday === null ? (
            <p className="text-sm text-muted-foreground">
              No classes run on Sunday, so nothing is free.
            </p>
          ) : absentCount === 0 ? (
            <p className="text-sm text-muted-foreground">
              No teachers are marked absent for this date.
            </p>
          ) : data.periods.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None of the absent teachers are the main teacher of a period on
              this day.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Absent teacher</TableHead>
                  <TableHead>Cover</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.periods.map((period) => (
                  <TableRow key={period.timetableId}>
                    <TableCell>{period.classLabel}</TableCell>
                    <TableCell>{period.periodNumber}</TableCell>
                    <TableCell>{period.subjectName}</TableCell>
                    <TableCell>{period.absentTeacherName}</TableCell>
                    <TableCell>
                      <CoverSelect
                        timetableId={period.timetableId}
                        coverTeacherId={period.coverTeacherId}
                        options={period.options}
                        teachers={data.teachers}
                        disabled={savingSlotId === period.timetableId}
                        onCover={onCover}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    </PickerGroup>
  );
}

export default function FreeClassesPage() {
  const [date, setDate] = useState(todayIso);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Free classes</h1>
          <p className="text-sm text-muted-foreground">
            Cover the periods left open by absent teachers.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="free-class-date">Date</Label>
          <Input
            id="free-class-date"
            type="date"
            value={date}
            onChange={(event) => {
              if (event.target.value) {
                setDate(event.target.value);
              }
            }}
          />
        </div>
      </div>
      <FreeClassesErrorBoundary resetKey={date}>
        <FreeClassesBody date={date} />
      </FreeClassesErrorBoundary>
    </div>
  );
}
