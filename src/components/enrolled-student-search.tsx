"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  SearchOption,
  SearchPopover,
} from "@/components/search-popover";

export type EnrolledStudentHit = {
  studentId: Id<"students">;
  studentName: string;
  admissionNumber: string;
  classId: Id<"classes">;
  classLabel: string;
};

export function EnrolledStudentSearch({
  selected,
  onSelect,
}: {
  selected: EnrolledStudentHit | null;
  onSelect: (student: EnrolledStudentHit) => void;
}) {
  return (
    <SearchPopover
      triggerLabel={
        selected
          ? `${selected.studentName} · ${selected.admissionNumber}`
          : undefined
      }
      placeholder="Search an enrolled student"
      listLabel="Enrolled students"
      inputLabel="Name or admission number"
    >
      {(query, close) => (
        <EnrolledHits
          query={query}
          selectedId={selected?.studentId}
          onSelect={(student) => {
            onSelect(student);
            close();
          }}
        />
      )}
    </SearchPopover>
  );
}

function EnrolledHits({
  query,
  selectedId,
  onSelect,
}: {
  query: string;
  selectedId?: Id<"students">;
  onSelect: (student: EnrolledStudentHit) => void;
}) {
  const term = query.trim();
  const result = useQuery(
    api.studentMoves.searchEnrolled,
    term.length >= 1 ? { term } : "skip",
  );

  if (term.length < 1) {
    return (
      <p className="px-1.5 py-1 text-xs text-muted-foreground">
        Type a name or admission number.
      </p>
    );
  }
  if (result === undefined) {
    return (
      <p className="px-1.5 py-1 text-xs text-muted-foreground">Searching…</p>
    );
  }
  if (result.students.length === 0) {
    return (
      <p className="px-1.5 py-1 text-xs text-muted-foreground">
        No matching enrolled student.
      </p>
    );
  }
  return (
    <>
      {result.truncated ? (
        <p className="px-1.5 py-1 text-xs text-muted-foreground">
          Showing the first {result.students.length} matches. Type more of the
          name or admission number.
        </p>
      ) : null}
      {result.students.map((student) => (
        <SearchOption
          key={student.studentId}
          label={student.studentName}
          description={`${student.admissionNumber} · ${student.classLabel}`}
          selected={student.studentId === selectedId}
          onClick={() => onSelect(student)}
        />
      ))}
    </>
  );
}
