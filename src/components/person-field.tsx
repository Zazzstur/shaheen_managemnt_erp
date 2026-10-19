"use client";

import {
  SearchOption,
  SearchPopover,
  textMatches,
} from "@/components/search-popover";

export type PersonOption = {
  id: string;
  label: string;
  searchText?: string;
};

export function PersonField({
  people,
  selectedId,
  selectedLabel,
  placeholder,
  searchPlaceholder,
  listLabel,
  onSelect,
}: {
  people: PersonOption[];
  selectedId?: string;
  selectedLabel?: string;
  placeholder: string;
  searchPlaceholder: string;
  listLabel: string;
  onSelect: (id: string) => void;
}) {
  return (
    <SearchPopover
      triggerLabel={selectedLabel}
      placeholder={placeholder}
      listLabel={listLabel}
      inputLabel={searchPlaceholder}
    >
      {(query, close) => {
        const filtered = people.filter((person) =>
          textMatches([person.label, person.searchText], query),
        );
        if (people.length === 0) {
          return (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              No people yet.
            </p>
          );
        }
        if (filtered.length === 0) {
          return (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              No matches.
            </p>
          );
        }
        return filtered.map((person) => (
          <SearchOption
            key={person.id}
            label={person.label}
            selected={person.id === selectedId}
            onClick={() => {
              onSelect(person.id);
              close();
            }}
          />
        ));
      }}
    </SearchPopover>
  );
}
