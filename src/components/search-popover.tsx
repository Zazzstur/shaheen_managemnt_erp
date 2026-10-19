"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePickerOpen } from "@/components/picker-group";

export function normalizeForSearch(value: string) {
  return value.normalize("NFC").toLocaleLowerCase();
}

export function textMatches(
  parts: Array<string | undefined | null>,
  query: string,
) {
  const needle = normalizeForSearch(query.trim());
  if (!needle) return true;
  return normalizeForSearch(parts.filter(Boolean).join(" ")).includes(needle);
}

export function SearchOption({
  label,
  description,
  selected = false,
  disabled = false,
  onClick,
}: {
  label: string;
  description?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      className="relative flex w-full cursor-default items-center rounded-md py-1 pr-8 pl-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
      onClick={onClick}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {description ? (
          <span className="block truncate text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {selected ? (
        <CheckIcon className="pointer-events-none absolute right-2 size-4" />
      ) : null}
    </button>
  );
}

export function SearchPopover({
  triggerLabel,
  placeholder,
  listLabel,
  inputLabel = "Search",
  disabled = false,
  submitting = false,
  submitLabel,
  onSubmit,
  triggerClassName,
  triggerId,
  children,
}: {
  triggerLabel?: string;
  placeholder: string;
  listLabel: string;
  inputLabel?: string;
  disabled?: boolean;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit?: (query: string) => Promise<boolean | void> | boolean | void;
  triggerClassName?: string;
  triggerId?: string;
  children: (query: string, close: () => void) => ReactNode;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = usePickerOpen();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
    >
      <PopoverTrigger
        id={triggerId}
        type="button"
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full min-w-0 justify-between gap-1.5 px-2.5 font-normal",
          triggerClassName,
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            triggerLabel ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {triggerLabel ?? placeholder}
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent>
        <form
          className="flex shrink-0 gap-1 p-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!onSubmit || submitting) return;
            void (async () => {
              const result = await onSubmit(query);
              if (result !== false) close();
            })();
          }}
        >
          <Input
            ref={inputRef}
            autoComplete="off"
            aria-label={inputLabel}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open}
            value={query}
            placeholder="Search"
            disabled={submitting}
            onChange={(event) => setQuery(event.target.value)}
          />
          {onSubmit ? (
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "…" : (submitLabel ?? "Save")}
            </Button>
          ) : null}
        </form>
        <div
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className="max-h-[min(15rem,calc(var(--available-height)-3rem))] overflow-y-auto overscroll-contain p-1"
        >
          {children(query, close)}
        </div>
      </PopoverContent>
    </Popover>
  );
}
