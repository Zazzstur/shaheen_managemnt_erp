"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SubjectOption = {
  _id: Id<"subjects">;
  name: string;
};

export function SubjectField({
  subjects,
  selectedId,
  selectedName,
  onSelect,
}: {
  subjects: SubjectOption[];
  selectedId?: Id<"subjects">;
  selectedName?: string;
  onSelect: (subjectId: Id<"subjects">) => Promise<void> | void;
}) {
  const createOrGet = useMutation(api.catalog.createOrGetByName);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const saveName = async (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a subject name");
      return;
    }
    setSaving(true);
    try {
      const subjectId = await createOrGet({ name: trimmed });
      await onSelect(subjectId);
      toast.success(`Saved ${trimmed}`);
      setName("");
      setOpen(false);
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between font-normal"
        onClick={() => {
          setName(selectedName ?? "");
          setOpen(true);
        }}
      >
        <span className="truncate">{selectedName ?? "Add subject"}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border bg-background p-2">
      <form className="flex gap-1" onSubmit={(event) => void saveName(event)}>
        <Input
          autoFocus
          value={name}
          placeholder="Subject name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "…" : "Save"}
        </Button>
      </form>
      <div className="max-h-36 space-y-1 overflow-y-auto">
        {subjects.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">
            No subjects yet. Type a name and save.
          </p>
        ) : (
          subjects.map((subject) => (
            <button
              key={subject._id}
              type="button"
              className="flex w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
              onClick={() => {
                void (async () => {
                  await onSelect(subject._id);
                  setOpen(false);
                })();
              }}
            >
              {subject.name}
              {subject._id === selectedId ? " ✓" : ""}
            </button>
          ))
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full"
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
    </div>
  );
}
