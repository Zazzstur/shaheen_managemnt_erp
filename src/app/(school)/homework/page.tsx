"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { domToBlob } from "modern-screenshot";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import {
  downloadBlob,
  isLocalSchoolComputer,
  openBrowserTab,
  shareImageFromBrowser,
} from "@/lib/share-whatsapp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardAction,
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
} from "@/components/ui/select";

function todayIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function isSunday(iso: string) {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return false;
  }
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
}

type HomeworkRow = {
  classId: Id<"classes">;
  classLabel: string;
  subjectId: Id<"subjects">;
  subjectName: string;
  periodNumber: number;
  teacherName: string;
  message: string;
};

function rowKey(row: Pick<HomeworkRow, "classId" | "subjectId" | "periodNumber">) {
  return `${row.classId}:${row.subjectId}:${row.periodNumber}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatShareDate(date: string) {
  const [year, month, day] = date.split("-");
  const monthName = MONTHS[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthName} ${year}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function placeHomeworkPhoto(file: File) {
  try {
    const imageBase64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    const response = await fetch("/api/whatsapp-desktop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: "", imageBase64 }),
    });
    if (!response.ok) {
      return false;
    }
    const result = (await response.json()) as { ok?: boolean };
    return result.ok === true;
  } catch {
    return false;
  }
}

function HomeworkSheet({
  classLabel,
  dateLabel,
  rows,
}: {
  classLabel: string;
  dateLabel: string;
  rows: HomeworkRow[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
          Homework
        </p>
        <p className="text-2xl font-semibold">{classLabel}</p>
        <p className="text-sm text-neutral-600">{dateLabel}</p>
      </div>
      {rows.map((row) => (
        <div key={rowKey(row)} className="border-t border-neutral-200 pt-3">
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Period {row.periodNumber}
          </p>
          <p className="font-semibold">{row.subjectName}</p>
          <p className="script-text mt-1 text-sm whitespace-pre-wrap" dir="auto">
            {row.message.trim() || "No homework entered."}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function HomeworkPage() {
  const me = useQuery(api.users.me);
  const classes = useQuery(
    api.catalog.listClasses,
    me?.role === "super_admin" ? {} : "skip",
  );
  const [date, setDate] = useState(todayIso);
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState("");
  const [sharing, setSharing] = useState(false);
  const [readyIds, setReadyIds] = useState<string[]>([]);
  const sheetRefs = useRef(new Map<string, HTMLDivElement>());
  const photosRef = useRef(new Map<string, File>());
  const groupsRef = useRef<Array<{ classLabel: string; rows: HomeworkRow[] }>>([]);
  const sunday = isSunday(date);
  const isSuperAdmin = me?.role === "super_admin";
  const canEnter = me?.role === "teacher";
  const mine = useQuery(
    api.homework.mineForDate,
    canEnter && !sunday ? { date } : "skip",
  );
  const classRows = useQuery(
    api.homework.forClassDate,
    isSuperAdmin && classId && !sunday ? { classId, date } : "skip",
  );
  const saveHomework = useMutation(api.homework.save);
  const rows = isSuperAdmin ? classRows : mine;
  const rowsKey = (rows ?? [])
    .map((row) => `${rowKey(row)}:${row.message}`)
    .join("|");
  const [seededKey, setSeededKey] = useState("");
  if (rows && rowsKey !== seededKey) {
    const next: Record<string, string> = {};
    for (const row of rows) {
      next[rowKey(row)] = row.message;
    }
    setSeededKey(rowsKey);
    setDrafts(next);
  }

  const groups = useMemo(() => {
    const grouped = new Map<string, { classLabel: string; rows: HomeworkRow[] }>();
    for (const row of rows ?? []) {
      const group = grouped.get(row.classId) ?? {
        classLabel: row.classLabel,
        rows: [],
      };
      group.rows.push(row);
      grouped.set(row.classId, group);
    }
    return [...grouped.values()];
  }, [rows]);
  const shareSignature = isSuperAdmin
    ? groups
        .map((group) =>
          [
            group.rows[0]?.classId ?? "",
            formatShareDate(date),
            ...group.rows.map((row) => `${rowKey(row)}:${row.message}`),
          ].join("~"),
        )
        .join("||")
    : "";

  groupsRef.current = groups;

  useEffect(() => {
    if (!isSuperAdmin || !shareSignature) {
      return;
    }
    const shareGroups = groupsRef.current;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const ready: string[] = [];
        for (const group of shareGroups) {
          const id = group.rows[0]?.classId;
          const node = id ? sheetRefs.current.get(id) : undefined;
          if (!id || !node) {
            continue;
          }
          try {
            const blob = await domToBlob(node, {
              backgroundColor: "#FDFBF3",
              scale: 2,
            });
            if (cancelled) {
              return;
            }
            photosRef.current.set(
              id,
              new File([blob], "homework.png", { type: "image/png" }),
            );
            ready.push(id);
          } catch {
            if (!cancelled) {
              toast.error("Could not create the homework photo");
            }
          }
        }
        if (!cancelled) {
          setReadyIds(ready);
        }
      })();
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      photosRef.current.clear();
      setReadyIds([]);
    };
  }, [isSuperAdmin, shareSignature]);

  function onShare(classLabel: string, classId: string) {
    const file = photosRef.current.get(classId);
    if (!file || sharing) {
      return;
    }
    if (!isLocalSchoolComputer()) {
      setSharing(true);
      void shareImageFromBrowser(file, { text: `${classLabel} homework` })
        .then((result) => {
          if (!result.copied) {
            toast.message(
              result.opened
                ? "WhatsApp is open. Attach the homework photo, then send."
                : "The browser blocked WhatsApp. Allow pop-ups, then try again.",
              {
                action: {
                  label: result.opened ? "Download photo" : "Open WhatsApp",
                  onClick: () => {
                    if (result.opened) {
                      downloadBlob(file, "homework.png");
                    } else {
                      openBrowserTab(result.webUrl);
                    }
                  },
                },
              },
            );
            return;
          }
          toast.message(
            result.opened
              ? "The homework photo is copied. Choose the person or group in WhatsApp, press Ctrl+V, then send."
              : "The homework photo is copied. Open WhatsApp, choose the person or group, press Ctrl+V, then send.",
            result.opened
              ? undefined
              : {
                  action: {
                    label: "Open WhatsApp",
                    onClick: () => {
                      openBrowserTab(result.webUrl);
                    },
                  },
                },
          );
        })
        .finally(() => {
          setSharing(false);
        });
      return;
    }
    setSharing(true);
    void placeHomeworkPhoto(file)
      .then((opened) => {
        if (!opened) {
          const appLink = document.createElement("a");
          appLink.href = "whatsapp://";
          appLink.click();
        }
        toast.message(
          "WhatsApp is open. Choose the person or group. If the homework photo is not attached, press Ctrl+V, then send.",
        );
      })
      .finally(() => {
        setSharing(false);
      });
  }

  async function onSave(row: HomeworkRow) {
    const key = rowKey(row);
    setSavingKey(key);
    try {
      await saveHomework({
        classId: row.classId,
        subjectId: row.subjectId,
        periodNumber: row.periodNumber,
        date,
        message: drafts[key] ?? "",
      });
      toast.success("Homework saved");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSavingKey("");
    }
  }

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading homework…</p>;
  }
  if (me === null || (!canEnter && !isSuperAdmin)) {
    return (
      <p className="text-sm text-muted-foreground">
        Only teachers and super admins can open homework.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Homework</h1>
        <p className="text-sm text-muted-foreground">
          {isSuperAdmin
            ? "Homework for the selected class, taken from that day's timetable."
            : "Classes and subjects from your timetable for the selected day."}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{isSuperAdmin ? "Class homework" : "Enter homework"}</CardTitle>
          <CardDescription>
            {isSuperAdmin
              ? "Choose a class and a date."
              : "Use another date if homework for a missed day still needs to be entered."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {isSuperAdmin ? (
            <div className="space-y-2">
              <Label>Class</Label>
              <Select
                value={classId || null}
                items={Object.fromEntries(
                  (classes ?? []).map((classroom) => [
                    classroom._id,
                    `${classroom.name} ${classroom.section}`.trim(),
                  ]),
                )}
                onValueChange={(value) =>
                  setClassId((value as Id<"classes">) || "")
                }
              >
                <SelectTrigger className="w-full">
                  <span className="truncate">
                    {(() => {
                      const selected = (classes ?? []).find(
                        (classroom) => classroom._id === classId,
                      );
                      return selected
                        ? `${selected.name} ${selected.section}`.trim()
                        : "Select class";
                    })()}
                  </span>
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
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="homework-date">Date</Label>
            <Input
              id="homework-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {sunday ? (
        <p className="text-sm text-muted-foreground">
          There is no timetable on Sunday.
        </p>
      ) : isSuperAdmin && !classId ? (
        <p className="text-sm text-muted-foreground">
          Choose a class to see its homework.
        </p>
      ) : rows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading homework…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isSuperAdmin
            ? "This class has no subjects on the timetable for this day."
            : "No classes or subjects are on your timetable for this day."}
        </p>
      ) : (
        groups.map((group) => (
          <Card key={group.classLabel}>
            <CardHeader>
              <CardTitle>{group.classLabel}</CardTitle>
              <CardDescription>
                {group.rows.length} {group.rows.length === 1 ? "period" : "periods"}
              </CardDescription>
              {isSuperAdmin ? (
                <CardAction>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      sharing || !readyIds.includes(group.rows[0]?.classId ?? "")
                    }
                    onClick={() =>
                      onShare(group.classLabel, group.rows[0]?.classId ?? "")
                    }
                  >
                    <Share2 />
                    {sharing
                      ? "Sharing…"
                      : readyIds.includes(group.rows[0]?.classId ?? "")
                        ? "Share"
                        : "Preparing photo…"}
                  </Button>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className="px-0">
              <div className="divide-y">
                {group.rows.map((row) => {
                  const key = rowKey(row);
                  const showTeacher = isSuperAdmin;
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 px-(--card-spacing) py-3"
                    >
                      <div>
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Period
                        </p>
                        <p className="text-lg leading-none font-semibold tabular-nums">
                          {row.periodNumber}
                        </p>
                      </div>
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="font-medium">{row.subjectName}</p>
                          {showTeacher ? (
                            <p className="text-sm text-muted-foreground">
                              {row.teacherName}
                            </p>
                          ) : null}
                        </div>
                        {canEnter ? (
                          <div className="space-y-2">
                            <Textarea
                              value={drafts[key] ?? ""}
                              dir="auto"
                              lang="und"
                              placeholder="Homework"
                              maxLength={1000}
                              className="script-text min-h-14"
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }))
                              }
                            />
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                disabled={
                                  savingKey === key ||
                                  (drafts[key] ?? "") === row.message
                                }
                                onClick={() => {
                                  void onSave(row);
                                }}
                              >
                                {savingKey === key ? "Saving…" : "Save"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p
                            dir="auto"
                            className={
                              row.message
                                ? "script-text rounded-lg bg-muted/60 px-3 py-2 text-sm whitespace-pre-wrap"
                                : "text-sm text-muted-foreground"
                            }
                          >
                            {row.message || "No homework entered."}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))
      )}
      {isSuperAdmin
        ? groups.map((group, index) => {
            const id = group.rows[0]?.classId;
            if (!id) {
              return null;
            }
            return (
              <div
                key={id}
                ref={(node) => {
                  if (node) {
                    sheetRefs.current.set(id, node);
                  } else {
                    sheetRefs.current.delete(id);
                  }
                }}
                aria-hidden
                className="pointer-events-none fixed left-[-1400px] w-[640px] bg-[#FDFBF3] p-8 text-neutral-900"
                style={{ top: index * 2400 }}
              >
                <HomeworkSheet
                  classLabel={group.classLabel}
                  dateLabel={formatShareDate(date)}
                  rows={group.rows}
                />
              </div>
            );
          })
        : null}
    </div>
  );
}
