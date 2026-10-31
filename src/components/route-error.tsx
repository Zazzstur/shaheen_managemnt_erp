"use client";

import { Button } from "@/components/ui/button";

export function RouteError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-destructive">
        {error.message || "Something went wrong."}
      </p>
      <Button type="button" variant="outline" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
