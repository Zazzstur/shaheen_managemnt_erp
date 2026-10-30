"use client";

import { useQuery } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import {
  Bus,
  CalendarDays,
  CalendarRange,
  CalendarOff,
  ClipboardCheck,
  ClipboardList,
  ContactRound,
  UserCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Menu,
  NotebookPen,
  PencilLine,
  Receipt,
  School,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

const NAV = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["super_admin", "teacher", "student", "parent"],
  },
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
  {
    href: "/classes",
    label: "Classes",
    icon: School,
    roles: ["super_admin"],
  },
  {
    href: "/transport",
    label: "Transport",
    icon: Bus,
    roles: ["super_admin"],
  },
  {
    href: "/admin/fees",
    label: "Fees",
    icon: Receipt,
    roles: ["super_admin", "parent", "student"],
  },
  {
    href: "/admin/users",
    label: "Teachers",
    icon: Users,
    roles: ["super_admin"],
  },
  {
    href: "/admin/staff-attendance",
    label: "Staff attendance",
    icon: UserCheck,
    roles: ["super_admin"],
  },
  {
    href: "/admin/free-classes",
    label: "Free classes",
    icon: CalendarOff,
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
    href: "/report-cards",
    label: "Report cards",
    icon: FileText,
    roles: ["super_admin", "teacher"],
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
] as const;

function NavLinks({
  role,
  staffRole,
  onNavigate,
}: {
  role: string;
  staffRole?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((item) => {
        if (item.href === "/admin/users" && staffRole === "data_entry") {
          return false;
        }
        return canOpenNavItem(item, role, staffRole);
      }).map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/70",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody() {
  const loaded = useQuery(api.users.me);
  const cached = useRef(loaded);
  if (loaded !== undefined) {
    cached.current = loaded;
  }
  const user = loaded === undefined ? cached.current : loaded;
  const { signOut } = useAuthActions();

  if (user === undefined) {
    return <p className="text-sm text-muted-foreground">Loading profile…</p>;
  }
  if (user === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Your account is not available. Sign in again.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <img
            src="/shaheen-academy-logo.svg"
            alt=""
            className="h-8 w-auto shrink-0"
          />
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            SACH
          </p>
        </div>
        <p className="mt-2 font-medium">{user.name ?? user.email}</p>
        <Badge className="mt-2" variant="secondary">
          {user.staffRole === "data_entry"
            ? "data entry"
            : user.staffRole === "incharge"
              ? "incharge"
              : user.role.replace("_", " ")}
        </Badge>
      </div>
      <Separator />
      <NavLinks
        role={user.staffRole === "data_entry" ? "super_admin" : user.role}
        staffRole={user.staffRole}
      />
      <div className="mt-auto">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            void signOut();
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();

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
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar p-4 md:block print:hidden">
        <SidebarBody />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-3 md:hidden print:hidden">
          <Sheet>
            <SheetTrigger render={<Button variant="outline" size="icon" />}>
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <SidebarBody />
            </SheetContent>
          </Sheet>
          <img
            src="/shaheen-academy-logo.svg"
            alt=""
            className="h-8 w-auto shrink-0"
          />
          <span className="font-medium">SACH</span>
        </header>
        <main className="flex-1 p-4 md:p-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
