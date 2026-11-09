"use client";

import { useMutation, useQuery } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  Banknote,
  Boxes,
  Bus,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  CalendarOff,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  ContactRound,
  FileText,
  Fuel,
  GraduationCap,
  HandHelping,
  IdCard,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  Package,
  PencilLine,
  Plus,
  Receipt,
  School,
  ScrollText,
  Star,
  UserRound,
  Wallet,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { canOpenNavItem } from "@/lib/access";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: ["super_admin", "teacher", "student", "parent"],
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/admin/students",
        label: "Admissions",
        icon: GraduationCap,
        roles: ["super_admin"],
      },
      {
        href: "/students",
        label: "Students",
        icon: ContactRound,
        roles: ["super_admin", "teacher"],
      },
    ],
  },
  {
    label: "Academics",
    items: [
      {
        href: "/classes",
        label: "Classes",
        icon: School,
        roles: ["super_admin"],
      },
      {
        href: "/timetable",
        label: "Timetable",
        icon: CalendarDays,
        roles: ["super_admin", "teacher", "student", "parent"],
      },
      {
        href: "/admin/teachers-timetable",
        label: "Teachers timetable",
        icon: CalendarRange,
        roles: ["super_admin"],
        alsoStaffRoles: ["incharge"],
      },
      {
        href: "/teacher/attendance",
        label: "Attendance",
        icon: ClipboardCheck,
        roles: ["teacher"],
        staffRoles: ["class_teacher", "incharge"],
      },
      {
        href: "/admin/free-classes",
        label: "Free classes",
        icon: CalendarOff,
        roles: ["super_admin"],
        alsoStaffRoles: ["incharge"],
      },
      {
        href: "/classwork",
        label: "Classwork",
        icon: PencilLine,
        roles: ["teacher"],
      },
      {
        href: "/homework",
        label: "Homework",
        icon: NotebookPen,
        roles: ["teacher"],
      },
      {
        href: "/assignment",
        label: "Assignment",
        icon: ClipboardList,
        roles: ["super_admin", "teacher"],
        staffRoles: ["incharge"],
      },
      {
        href: "/report-cards",
        label: "Report cards",
        icon: FileText,
        roles: ["super_admin", "teacher"],
      },
    ],
  },
  {
    label: "Office",
    items: [
      {
        href: "/transport",
        label: "Transport",
        icon: Bus,
        roles: ["super_admin"],
      },
      {
        href: "/fuel",
        label: "Fuel",
        icon: Fuel,
        roles: ["super_admin"],
      },
      {
        href: "/admin/users",
        label: "Staff management",
        icon: Users,
        roles: ["super_admin"],
      },
      {
        href: "/stock/inventory",
        label: "Stock management",
        icon: Boxes,
        roles: ["super_admin"],
        staffRoles: ["incharge"],
      },
      {
        href: "/admin/fees",
        label: "Fees",
        icon: Receipt,
        roles: ["super_admin", "parent", "student"],
      },
      {
        href: "/expenses",
        label: "Expenses",
        icon: Wallet,
        roles: ["super_admin"],
      },
    ],
  },
] as const;

const STUDENT_LINKS = [
  {
    href: "/students",
    label: "Student details",
    icon: IdCard,
    roles: ["super_admin", "teacher"],
  },
  {
    href: "/students/class-change",
    label: "Class change",
    icon: ArrowRightLeft,
    roles: ["super_admin"],
  },
  {
    href: "/students/transfer-certificate",
    label: "Transfer certificate",
    icon: ScrollText,
    roles: ["super_admin"],
  },
] as const;

const STAFF_LINKS = [
  {
    href: "/admin/users",
    label: "Staff",
    icon: UserRound,
    roles: ["super_admin"],
  },
  {
    href: "/admin/staff-attendance",
    label: "Staff attendance",
    icon: CalendarCheck,
    roles: ["super_admin"],
  },
  {
    href: "/admin/staff-payments",
    label: "Staff payments",
    icon: Banknote,
    roles: ["super_admin"],
  },
] as const;

const STOCK_LINKS = [
  {
    href: "/stock/add",
    label: "Add stock",
    icon: Plus,
    roles: ["super_admin"],
  },
  {
    href: "/stock/inventory",
    label: "Inventory",
    icon: Package,
    roles: ["super_admin"],
    staffRoles: ["incharge"],
  },
  {
    href: "/stock/give",
    label: "Give",
    icon: HandHelping,
    roles: ["super_admin"],
    staffRoles: ["incharge"],
  },
] as const;

type NavIcon = React.ComponentType<{ className?: string }>;

type StarNavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  roles: readonly string[];
  staffRoles?: readonly string[];
  alsoStaffRoles?: readonly string[];
};

function pushStarItem(
  items: StarNavItem[],
  seen: Set<string>,
  item: {
    href: string;
    label: string;
    icon?: NavIcon;
    roles: readonly string[];
    staffRoles?: readonly string[];
    alsoStaffRoles?: readonly string[];
  },
  fallbackIcon: NavIcon,
) {
  if (item.href === "/dashboard" || seen.has(item.href)) {
    return;
  }
  seen.add(item.href);
  items.push({
    href: item.href,
    label: item.label,
    icon: item.icon ?? fallbackIcon,
    roles: item.roles,
    staffRoles: item.staffRoles,
    alsoStaffRoles: item.alsoStaffRoles,
  });
}

function childLinksFor(item: { href: string; label: string }) {
  if (item.href === "/students") {
    return STUDENT_LINKS;
  }
  if (item.label === "Staff management") {
    return STAFF_LINKS;
  }
  if (item.label === "Stock management") {
    return STOCK_LINKS;
  }
  return null;
}

function starNavItems() {
  const items: StarNavItem[] = [];
  const seen = new Set<string>();
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const children = childLinksFor(item);
      const childOwnsHref = children?.some((child) => child.href === item.href);
      if (!childOwnsHref) {
        pushStarItem(items, seen, item, item.icon);
      }
      if (children) {
        for (const child of children) {
          pushStarItem(items, seen, child, child.icon);
        }
      }
    }
  }
  return items;
}

function navItemForPath(pathname: string) {
  return starNavItems().find((item) => item.href === pathname);
}

function NavItemLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: NavIcon;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-white/10 text-sidebar-primary shadow-[inset_3px_0_0_0_var(--sidebar-primary)]"
          : "text-sidebar-foreground/90 hover:bg-white/8",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  );
}

function PageStar() {
  const pathname = usePathname();
  const user = useQuery(api.users.me);
  const starredPaths = useQuery(api.pageStars.list);
  const toggle = useMutation(api.pageStars.toggle);
  const [busy, setBusy] = useState(false);

  if (!user || starredPaths === undefined) {
    return null;
  }
  const role = user.staffRole === "data_entry" ? "super_admin" : user.role;
  const item = navItemForPath(pathname);
  if (!item || !canOpenNavItem(item, role, user.staffRole)) {
    return null;
  }
  const starred = starredPaths.includes(pathname);

  return (
    <div className="mb-1 flex print:hidden">
      <button
        type="button"
        aria-label={starred ? "Unstar this page" : "Star this page"}
        aria-pressed={starred}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void toggle({ path: pathname })
            .catch(() => {
              toast.error("Could not update this star");
            })
            .finally(() => {
              setBusy(false);
            });
        }}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-sm bg-transparent p-0 text-foreground/20 hover:bg-transparent hover:text-foreground/45",
          starred && "text-amber-500 hover:text-amber-600",
        )}
      >
        <Star
          className={cn(
            "size-4",
            starred ? "fill-amber-400 text-amber-500" : "fill-transparent",
          )}
          strokeWidth={1.75}
        />
      </button>
    </div>
  );
}

function SubNavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: NavIcon;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-lg py-2 pr-3 pl-9 text-sm font-medium transition-colors",
        active
          ? "bg-white/10 text-sidebar-primary shadow-[inset_3px_0_0_0_var(--sidebar-primary)]"
          : "text-sidebar-foreground/90 hover:bg-white/8",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </Link>
  );
}

function StudentsNav({
  role,
  staffRole,
  onNavigate,
}: {
  role: string;
  staffRole?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const links = STUDENT_LINKS.filter((item) =>
    canOpenNavItem(item, role, staffRole),
  );
  const sectionActive = links.some((item) => pathname === item.href);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/students/") && pathname !== "/students") {
      setOpen(true);
    }
  }, [pathname]);

  if (links.length === 0) {
    return null;
  }

  const parentActive = !open && sectionActive;

  function toggle() {
    setOpen((value) => !value);
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "flex cursor-pointer items-center rounded-lg",
          parentActive
            ? "bg-white/10 text-sidebar-primary shadow-[inset_3px_0_0_0_var(--sidebar-primary)]"
            : "text-sidebar-foreground hover:bg-white/8",
        )}
        onClick={toggle}
      >
        <ContactRound className="ml-3 size-4 shrink-0" />
        <span
          className={cn(
            "px-2 py-2 text-sm font-medium",
            parentActive
              ? "text-sidebar-accent-foreground"
              : "text-sidebar-foreground",
          )}
        >
          Students
        </span>
        <button
          type="button"
          className="mr-1 ml-auto rounded-md p-1.5 text-sidebar-foreground/80 hover:bg-white/10"
          aria-expanded={open}
          aria-label={open ? "Collapse Students" : "Expand Students"}
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              open ? "rotate-180" : "rotate-0",
            )}
          />
        </button>
      </div>
      {open
        ? links.map((item) => {
            const active = pathname === item.href;
            return (
              <SubNavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={active}
                onNavigate={onNavigate}
              />
            );
          })
        : null}
    </div>
  );
}

function StaffNav({
  role,
  staffRole,
  onNavigate,
}: {
  role: string;
  staffRole?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const links = STAFF_LINKS.filter((item) =>
    canOpenNavItem(item, role, staffRole),
  );
  const sectionActive = links.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sectionActive) {
      setOpen(true);
    }
  }, [sectionActive]);

  if (links.length === 0) {
    return null;
  }

  const parentActive = !open && sectionActive;

  function toggle() {
    setOpen((value) => !value);
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "flex cursor-pointer items-center rounded-lg",
          parentActive
            ? "bg-white/10 text-sidebar-primary shadow-[inset_3px_0_0_0_var(--sidebar-primary)]"
            : "text-sidebar-foreground hover:bg-white/8",
        )}
        onClick={toggle}
      >
        <Users className="ml-3 size-4 shrink-0" />
        <span
          className={cn(
            "px-2 py-2 text-sm font-medium",
            parentActive
              ? "text-sidebar-accent-foreground"
              : "text-sidebar-foreground",
          )}
        >
          Staff management
        </span>
        <button
          type="button"
          className="mr-1 ml-auto rounded-md p-1.5 text-sidebar-foreground/80 hover:bg-white/10"
          aria-expanded={open}
          aria-label={
            open ? "Collapse Staff management" : "Expand Staff management"
          }
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              open ? "rotate-180" : "rotate-0",
            )}
          />
        </button>
      </div>
      {open
        ? links.map((item) => {
            const active = pathname === item.href;
            return (
              <SubNavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={active}
                onNavigate={onNavigate}
              />
            );
          })
        : null}
    </div>
  );
}

function StockNav({
  role,
  staffRole,
  onNavigate,
}: {
  role: string;
  staffRole?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const links = STOCK_LINKS.filter((item) =>
    canOpenNavItem(item, role, staffRole),
  );
  const sectionActive = pathname.startsWith("/stock");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sectionActive) {
      setOpen(true);
    }
  }, [sectionActive]);

  if (links.length === 0) {
    return null;
  }

  const parentActive = !open && sectionActive;

  function toggle() {
    setOpen((value) => !value);
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "flex cursor-pointer items-center rounded-lg",
          parentActive
            ? "bg-white/10 text-sidebar-primary shadow-[inset_3px_0_0_0_var(--sidebar-primary)]"
            : "text-sidebar-foreground hover:bg-white/8",
        )}
        onClick={toggle}
      >
        <Boxes className="ml-3 size-4 shrink-0" />
        <span
          className={cn(
            "px-2 py-2 text-sm font-medium",
            parentActive
              ? "text-sidebar-accent-foreground"
              : "text-sidebar-foreground",
          )}
        >
          Stock management
        </span>
        <button
          type="button"
          className="mr-1 ml-auto rounded-md p-1.5 text-sidebar-foreground/80 hover:bg-white/10"
          aria-expanded={open}
          aria-label={
            open ? "Collapse Stock management" : "Expand Stock management"
          }
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              open ? "rotate-180" : "rotate-0",
            )}
          />
        </button>
      </div>
      {open
        ? links.map((item) => {
            const active = pathname === item.href;
            return (
              <SubNavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={active}
                onNavigate={onNavigate}
              />
            );
          })
        : null}
    </div>
  );
}

function NavLinks({
  role,
  staffRole,
  starredPaths,
  onNavigate,
}: {
  role: string;
  staffRole?: string;
  starredPaths: readonly string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const starred = new Set(starredPaths);
  const pinned = starNavItems().filter(
    (item) => starred.has(item.href) && canOpenNavItem(item, role, staffRole),
  );
  return (
    <nav className="flex flex-col gap-4">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => {
          return canOpenNavItem(item, role, staffRole);
        });
        if (items.length === 0) {
          return null;
        }
        return (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-[0.14em] text-sidebar-primary/80 uppercase">
              {group.label}
            </p>
            {items.map((item) => {
              if (item.href === "/students") {
                return (
                  <StudentsNav
                    key={item.href}
                    role={role}
                    staffRole={staffRole}
                    onNavigate={onNavigate}
                  />
                );
              }
              if (item.label === "Stock management") {
                return (
                  <StockNav
                    key={item.href}
                    role={role}
                    staffRole={staffRole}
                    onNavigate={onNavigate}
                  />
                );
              }
              if (item.label === "Staff management") {
                return (
                  <StaffNav
                    key={item.href}
                    role={role}
                    staffRole={staffRole}
                    onNavigate={onNavigate}
                  />
                );
              }
              const link = (
                <NavItemLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={pathname === item.href}
                  onNavigate={onNavigate}
                />
              );
              if (group.label !== "Overview" || item.href !== "/dashboard") {
                return link;
              }
              const extras = pinned.filter(
                (pinnedItem) =>
                  !items.some((existing) => existing.href === pinnedItem.href),
              );
              return [link, ...extras.map((pinnedItem) => (
                <NavItemLink
                  key={`star:${pinnedItem.href}`}
                  href={pinnedItem.href}
                  label={pinnedItem.label}
                  icon={pinnedItem.icon}
                  active={pathname === pinnedItem.href}
                  onNavigate={onNavigate}
                />
              ))];
            })}
          </div>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const loaded = useQuery(api.users.me);
  const cached = useRef(loaded);
  if (loaded !== undefined) {
    cached.current = loaded;
  }
  const user = loaded === undefined ? cached.current : loaded;
  const starredPaths = useQuery(api.pageStars.list);
  const { signOut } = useAuthActions();

  if (user === undefined) {
    return (
      <p className="text-sm text-sidebar-foreground/70">Loading profile…</p>
    );
  }
  if (user === null) {
    return (
      <p className="text-sm text-sidebar-foreground/70">
        Your account is not available. Sign in again.
      </p>
    );
  }

  const roleLabel =
    user.staffRole === "data_entry"
      ? "data entry"
      : user.staffRole === "observer"
        ? "observer"
      : user.staffRole === "incharge"
        ? "incharge"
        : user.role.replace("_", " ");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 px-1">
        <img
          src="/shaheen-academy-logo.svg"
          alt=""
          className="h-11 w-auto shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-wide">Shaheen Academy</p>
          <p className="text-xs text-sidebar-primary">Champawat</p>
        </div>
      </div>
      <div className="sidebar-nav-scroll mt-5 min-h-0 flex-1 overflow-y-auto">
        <NavLinks
          role={user.staffRole === "data_entry" ? "super_admin" : user.role}
          staffRole={user.staffRole}
          starredPaths={starredPaths ?? []}
          onNavigate={onNavigate}
        />
      </div>
      <div className="mt-4 border-t border-sidebar-border pt-4">
        <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
        <Badge
          className="mt-2 border-sidebar-primary/40 bg-sidebar-primary/15 text-sidebar-primary capitalize"
          variant="outline"
        >
          {roleLabel}
        </Badge>
        <Button
          variant="outline"
          className="mt-3 w-full border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground"
          onClick={() => {
            void signOut();
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!isAuthenticated) {
    if (isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Checking session…
        </div>
      );
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p>You need to sign in to continue.</p>
        <Button render={<Link href="/sign-in" />}>Go to sign in</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-sidebar p-4 text-sidebar-foreground md:flex md:flex-col print:hidden">
        <SidebarBody />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden print:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground"
                />
              }
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 border-sidebar-border bg-sidebar p-4 text-sidebar-foreground"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <SidebarBody onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>
          <img
            src="/shaheen-academy-logo.svg"
            alt=""
            className="h-9 w-auto shrink-0"
          />
          <span className="font-medium">Shaheen Academy</span>
        </header>
        <main className="flex-1 p-4 md:p-8 print:p-0">
          <PageStar />
          {children}
        </main>
      </div>
    </div>
  );
}
