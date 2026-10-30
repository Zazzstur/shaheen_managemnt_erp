"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { domToBlob } from "modern-screenshot";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { isSchoolAdmin } from "@/lib/access";
import { mutationResult } from "@/lib/result";
import { cn } from "@/lib/utils";
import {
  downloadBlob,
  isLocalSchoolComputer,
  openWhatsAppApp,
  prepareClipboardPng,
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

type WorkKind = "homework" | "classwork";

type WorkRow = {
  classId: Id<"classes">;
  classLabel: string;
  subjectId: Id<"subjects">;
  subjectName: string;
  periodNumber: number;
  teacherName: string;
  message: string;
};

const COPY = {
  homework: {
    noun: "Homework",
    lower: "homework",
    reviewTitle: "Homework",
    enterTitle: "Enter homework",
    pageReview:
      "Homework for the selected class, taken from that day's timetable.",
    pageEnter: "Classes and subjects from your timetable for the selected day.",
    cardReview: "Choose a class and a date.",
    cardEnter:
      "Use another date if homework for a missed day still needs to be entered.",
    loading: "Loading homework…",
    denied: "Only teachers and super admins can open homework.",
    chooseClass: "Choose a class to see its homework.",
    emptyReview: "This class has no subjects on the timetable for this day.",
    emptyEnter: "No classes or subjects are on your timetable for this day.",
    emptyMessage: "No homework entered.",
    placeholder: "Homework",
    saved: "Homework saved",
    photoError: "Could not create the homework photo",
    shareLabel: (classLabel: string) => `${classLabel} homework`,
    fileName: "homework.png",
    attachOpen: "WhatsApp is open. Attach the homework photo, then send.",
    copiedOpen:
      "The homework photo is copied. Choose the person or group in WhatsApp, press Ctrl+V, then send.",
    copiedClosed:
      "The homework photo is copied. Open WhatsApp, choose the person or group, press Ctrl+V, then send.",
    desktopShare:
      "WhatsApp is open. Choose the person or group. If the homework photo is not attached, press Ctrl+V, then send.",
    dateId: "homework-date",
  },
  classwork: {
    noun: "Classwork",
    lower: "classwork",
    reviewTitle: "Classwork",
    enterTitle: "Enter classwork",
    pageReview:
      "Classwork for the selected class, taken from that day's timetable.",
    pageEnter: "Classes and subjects from your timetable for the selected day.",
    cardReview: "Choose a class and a date.",
    cardEnter:
      "Use another date if classwork for a missed day still needs to be entered.",
    loading: "Loading classwork…",
    denied: "Only teachers and super admins can open classwork.",
    chooseClass: "Choose a class to see its classwork.",
    emptyReview: "This class has no subjects on the timetable for this day.",
    emptyEnter: "No classes or subjects are on your timetable for this day.",
    emptyMessage: "No classwork entered.",
    placeholder: "Classwork",
    saved: "Classwork saved",
    photoError: "Could not create the classwork photo",
    shareLabel: (classLabel: string) => `${classLabel} classwork`,
    fileName: "classwork.png",
    attachOpen: "WhatsApp is open. Attach the classwork photo, then send.",
    copiedOpen:
      "The classwork photo is copied. Choose the person or group in WhatsApp, press Ctrl+V, then send.",
    copiedClosed:
      "The classwork photo is copied. Open WhatsApp, choose the person or group, press Ctrl+V, then send.",
    desktopShare:
      "WhatsApp is open. Choose the person or group. If the classwork photo is not attached, press Ctrl+V, then send.",
    dateId: "classwork-date",
  },
} as const;

const ENDPOINTS = {
  homework: {
    mineForDate: api.homework.mineForDate,
    forClassDate: api.homework.forClassDate,
    save: api.homework.save,
    update: api.homework.update,
  },
  classwork: {
    mineForDate: api.classwork.mineForDate,
    forClassDate: api.classwork.forClassDate,
    save: api.classwork.save,
    update: api.classwork.update,
  },
};

function rowKey(row: Pick<WorkRow, "classId" | "subjectId" | "periodNumber">) {
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

async function placeWorkPhoto(file: Blob) {
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

function WorkSheet({
  heading,
  classLabel,
  dateLabel,
  rows,
  emptyMessage,
}: {
  heading: string;
  classLabel: string;
  dateLabel: string;
  rows: WorkRow[];
  emptyMessage: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
          {heading}
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
            {row.message.trim() || emptyMessage}
          </p>
        </div>
      ))}
    </div>
  );
}

export function DailyWorkPage({
  kind: kindProp = "homework",
  mode = "default",
}: {
  kind?: WorkKind;
  mode?: "default" | "assignment";
}) {
  const router = useRouter();
  const assignment = mode === "assignment";
  const [category, setCategory] = useState<WorkKind>(kindProp);
  const kind = assignment ? category : kindProp;
  const copy = COPY[kind];
  const endpoints = ENDPOINTS[kind];
  const me = useQuery(api.users.me);
  const isAdmin = Boolean(me && isSchoolAdmin(me));
  const isIncharge = me?.staffRole === "incharge";
  const canReview = assignment && (isAdmin || isIncharge);
  const canEnter =
    me?.role === "teacher" && me.staffRole !== "data_entry" && !canReview;
  const classes = useQuery(api.catalog.listClasses, canReview ? {} : "skip");
  const reviewClasses = (classes ?? []).filter((classroom) =>
    isAdmin ? true : (me?.classIds ?? []).includes(classroom._id),
  );
  const [date, setDate] = useState(todayIso);
  const [classId, setClassId] = useState<Id<"classes"> | "">("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [sharing, setSharing] = useState(false);
  const [readyIds, setReadyIds] = useState<string[]>([]);
  const sheetRefs = useRef(new Map<string, HTMLDivElement>());
  const photosRef = useRef(new Map<string, Blob>());
  const groupsRef = useRef<Array<{ classLabel: string; rows: WorkRow[] }>>([]);
  const sunday = isSunday(date);
  const mine = useQuery(
    endpoints.mineForDate,
    canEnter && !sunday ? { date } : "skip",
  );
  const classRows = useQuery(
    endpoints.forClassDate,
    canReview && classId && !sunday ? { classId, date } : "skip",
  );
  const saveEntry = useMutation(endpoints.save);
  const updateEntry = useMutation(endpoints.update);
  const rows = canReview ? classRows : mine;
  const rowsKey = `${kind}|${(rows ?? [])
    .map((row) => `${rowKey(row)}:${row.message}`)
    .join("|")}`;
  const [seededKey, setSeededKey] = useState("");
  if (rows && rowsKey !== seededKey) {
    const next: Record<string, string> = {};
    for (const row of rows) {
      next[rowKey(row)] = row.message;
    }
    setSeededKey(rowsKey);
    setDrafts(next);
    setEditingKey("");
  }

  const groups = useMemo(() => {
    const grouped = new Map<string, { classLabel: string; rows: WorkRow[] }>();
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
  const shareSignature = canReview
    ? [
        kind,
        ...groups.map((group) =>
          [
            group.rows[0]?.classId ?? "",
            formatShareDate(date),
            ...group.rows.map((row) => `${rowKey(row)}:${row.message}`),
          ].join("~"),
        ),
      ].join("||")
    : "";

  groupsRef.current = groups;

  useEffect(() => {
    if (assignment || !isAdmin) {
      return;
    }
    router.replace("/assignment");
  }, [assignment, isAdmin, router]);

  useEffect(() => {
    if (!canReview || !shareSignature) {
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
              scale: 1,
            });
            if (cancelled) {
              return;
            }
            const png = await prepareClipboardPng(blob);
            if (cancelled) {
              return;
            }
            photosRef.current.set(id, png);
            ready.push(id);
          } catch {
            if (!cancelled) {
              toast.error(copy.photoError);
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
  }, [canReview, copy.photoError, shareSignature]);

  function onShare(classLabel: string, shareClassId: string) {
    const file = photosRef.current.get(shareClassId);
    if (!file || sharing) {
      return;
    }
    if (!isLocalSchoolComputer()) {
      const sharePromise = shareImageFromBrowser(file, {
        text: copy.shareLabel(classLabel),
      });
      setSharing(true);
      void sharePromise
        .then((result) => {
          if (!result.copied) {
            toast.message(
              result.opened
                ? copy.attachOpen
                : "The browser blocked WhatsApp. Allow pop-ups, then try again.",
              {
                action: {
                  label: result.opened ? "Download photo" : "Open WhatsApp",
                  onClick: () => {
                    if (result.opened) {
                      downloadBlob(file, copy.fileName);
                    } else {
                      openWhatsAppApp(result.webUrl);
                    }
                  },
                },
              },
            );
            return;
          }
          toast.message(
            result.opened ? copy.copiedOpen : copy.copiedClosed,
            result.opened
              ? undefined
              : {
                  action: {
                    label: "Open WhatsApp",
                    onClick: () => {
                      openWhatsAppApp(result.webUrl);
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
    void placeWorkPhoto(file)
      .then((opened) => {
        if (!opened) {
          const appLink = document.createElement("a");
          appLink.href = "whatsapp://";
          appLink.click();
        }
        toast.message(copy.desktopShare);
      })
      .finally(() => {
        setSharing(false);
      });
  }

  async function onSave(row: WorkRow) {
    const key = rowKey(row);
    setSavingKey(key);
    try {
      const payload = {
        classId: row.classId,
        subjectId: row.subjectId,
        periodNumber: row.periodNumber,
        date,
        message: drafts[key] ?? "",
      };
      if (canReview) {
        await updateEntry(payload);
      } else {
        await saveEntry(payload);
      }
      setEditingKey("");
      toast.success(copy.saved);
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSavingKey("");
    }
  }

  if (me === undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        {assignment ? "Loading assignment…" : copy.loading}
      </p>
    );
  }
  if (!assignment && isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">Opening assignment…</p>
    );
  }
  if (assignment && me && !isAdmin && !isIncharge) {
    return (
      <p className="text-sm text-muted-foreground">
        Only an incharge or super admin can open assignments.
      </p>
    );
  }
  if (me === null || (!canEnter && !canReview)) {
    return <p className="text-sm text-muted-foreground">{copy.denied}</p>;
  }
  if (canReview && isIncharge && reviewClasses.length === 0 && classes !== undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        No classes are assigned to you yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {assignment ? "Assignment" : copy.noun}
          </h1>
          <p className="text-sm text-muted-foreground">
            {assignment
              ? "Review and edit homework or classwork for a class."
              : canReview
                ? copy.pageReview
                : copy.pageEnter}
          </p>
        </div>
        {assignment ? (
          <div
            className="inline-flex rounded-lg bg-muted p-[3px]"
            role="tablist"
            aria-label="Assignment category"
          >
            {(["homework", "classwork"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={kind === value}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  kind === value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-foreground/60 hover:text-foreground",
                )}
                onClick={() => {
                  setCategory(value);
                  setEditingKey("");
                }}
              >
                {COPY[value].noun}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {assignment ? copy.noun : canReview ? copy.reviewTitle : copy.enterTitle}
          </CardTitle>
          <CardDescription>
            {canReview ? copy.cardReview : copy.cardEnter}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {canReview ? (
            <div className="space-y-2">
              <Label>Class</Label>
              <Select
                value={classId || null}
                items={Object.fromEntries(
                  reviewClasses.map((classroom) => [
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
                      const selected = reviewClasses.find(
                        (classroom) => classroom._id === classId,
                      );
                      return selected
                        ? `${selected.name} ${selected.section}`.trim()
                        : "Select class";
                    })()}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {reviewClasses.map((classroom) => (
                    <SelectItem key={classroom._id} value={classroom._id}>
                      {classroom.name} {classroom.section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={copy.dateId}>Date</Label>
            <Input
              id={copy.dateId}
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
      ) : canReview && !classId ? (
        <p className="text-sm text-muted-foreground">{copy.chooseClass}</p>
      ) : rows === undefined ? (
        <p className="text-sm text-muted-foreground">{copy.loading}</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canReview ? copy.emptyReview : copy.emptyEnter}
        </p>
      ) : (
        groups.map((group) => (
          <Card key={group.classLabel}>
            <CardHeader>
              <CardTitle>{group.classLabel}</CardTitle>
              <CardDescription>
                {group.rows.length} {group.rows.length === 1 ? "period" : "periods"}
              </CardDescription>
              {canReview ? (
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
                  const editing = canReview && editingKey === key;
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
                          {canReview ? (
                            <p className="text-sm text-muted-foreground">
                              {row.teacherName}
                            </p>
                          ) : null}
                        </div>
                        {canEnter || editing ? (
                          <div className="space-y-2">
                            <Textarea
                              value={drafts[key] ?? ""}
                              dir="auto"
                              lang="und"
                              placeholder={copy.placeholder}
                              maxLength={1000}
                              className="script-text min-h-14"
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }))
                              }
                            />
                            <div className="flex justify-end gap-2">
                              {editing ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={savingKey === key}
                                  onClick={() => {
                                    setDrafts((current) => ({
                                      ...current,
                                      [key]: row.message,
                                    }));
                                    setEditingKey("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              ) : null}
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
                          <div className="space-y-2">
                            <p
                              dir="auto"
                              className={
                                row.message
                                  ? "script-text rounded-lg bg-muted/60 px-3 py-2 text-sm whitespace-pre-wrap"
                                  : "text-sm text-muted-foreground"
                              }
                            >
                              {row.message || copy.emptyMessage}
                            </p>
                            {canReview ? (
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingKey(key)}
                                >
                                  Edit
                                </Button>
                              </div>
                            ) : null}
                          </div>
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
      {canReview
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
                <WorkSheet
                  heading={copy.noun}
                  classLabel={group.classLabel}
                  dateLabel={formatShareDate(date)}
                  rows={group.rows}
                  emptyMessage={copy.emptyMessage}
                />
              </div>
            );
          })
        : null}
    </div>
  );
}
