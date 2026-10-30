"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import { mutationResult } from "@/lib/result";
import {
  SearchOption,
  SearchPopover,
  textMatches,
} from "@/components/search-popover";

type SubjectOption = {
  _id: Id<"subjects">;
  name: string;
};

export function SubjectField({
  subjects,
  selectedId,
  selectedName,
  onSelect,
  onUnassign,
}: {
  subjects: SubjectOption[];
  selectedId?: Id<"subjects">;
  selectedName?: string;
  onSelect: (subjectId: Id<"subjects">) => Promise<void> | void;
  onUnassign?: () => Promise<void> | void;
}) {
  const createOrGet = useMutation(api.catalog.createOrGetByName);
  const [saving, setSaving] = useState(false);

  return (
    <SearchPopover
      triggerLabel={selectedName}
      placeholder="Add subject"
      listLabel="Subjects"
      inputLabel="Search subjects"
      submitting={saving}
      submitLabel="Save"
      onSubmit={async (query) => {
        const trimmed = query.trim();
        if (!trimmed) {
          toast.error("Enter a subject name");
          return false;
        }
        setSaving(true);
        try {
          const subjectId = await createOrGet({ name: trimmed });
          await onSelect(subjectId);
          toast.success(`Saved ${trimmed}`);
          return true;
        } catch (error) {
          toast.error(mutationResult(error).message);
          return false;
        } finally {
          setSaving(false);
        }
      }}
    >
      {(query, close) => {
        const showUnassign =
          onUnassign !== undefined && textMatches(["Unassign"], query);
        const filtered = subjects.filter((subject) =>
          textMatches([subject.name], query),
        );
        const unassign = showUnassign ? (
          <SearchOption
            label="Unassign"
            selected={!selectedId}
            onClick={() => {
              void (async () => {
                await onUnassign?.();
                close();
              })();
            }}
          />
        ) : null;
        if (!showUnassign && subjects.length === 0) {
          return (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              No subjects yet. Type a name and save.
            </p>
          );
        }
        if (!showUnassign && filtered.length === 0) {
          return (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              No matching subjects.
            </p>
          );
        }
        return (
          <>
            {unassign}
            {filtered.map((subject) => (
              <SearchOption
                key={subject._id}
                label={subject.name}
                selected={subject._id === selectedId}
                onClick={() => {
                  void (async () => {
                    await onSelect(subject._id);
                    close();
                  })();
                }}
              />
            ))}
          </>
        );
      }}
    </SearchPopover>
  );
}
