"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { canViewSchoolAdmin, isSchoolAdmin } from "@/lib/access";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/stock/give", label: "Give" },
  { href: "/stock/given", label: "Given stock" },
  { href: "/stock/lent", label: "Lent stock" },
] as const;

export function useStockAccess() {
  const me = useQuery(api.users.me);
  const allowed = Boolean(
    me && (canViewSchoolAdmin(me) || me.staffRole === "incharge"),
  );
  const admin = Boolean(me && isSchoolAdmin(me));
  const readOnly = Boolean(me && me.staffRole === "observer");
  return { me, allowed, admin, readOnly };
}

export function StockGate({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { me, allowed, admin, readOnly } = useStockAccess();
  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading stock…</p>;
  }
  if (me === null) {
    return (
      <p className="text-sm text-destructive">
        Your account is not available. Sign in again.
      </p>
    );
  }
  if (!allowed || (adminOnly && !admin && !readOnly)) {
    return (
      <p className="text-sm text-muted-foreground">
        {adminOnly
          ? "Only super admins and data entry can add stock."
          : "Only the office and an incharge can open stock."}
      </p>
    );
  }
  if (readOnly && adminOnly) {
    return (
      <p className="text-sm text-muted-foreground">
        Read-only. Observers cannot add stock.
      </p>
    );
  }
  return children;
}

export function StockTabs() {
  const pathname = usePathname();
  return (
    <div
      className="inline-flex rounded-lg bg-muted p-[3px]"
      role="tablist"
      aria-label="Stock records"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground/60 hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
