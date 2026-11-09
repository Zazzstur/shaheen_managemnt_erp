"use client";

import { useQuery } from "convex/react";
import { canOpenNavItem, isSchoolAdmin } from "@/lib/access";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import {
  Boxes,
  Bus,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  ContactRound,
  FileText,
  Fuel,
  GraduationCap,
  NotebookPen,
  PencilLine,
  Receipt,
  School,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { DashboardOverview } from "@/components/dashboard-overview";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const GROUPS = [
  {
    label: "People",
    links: [
      {
        href: "/admin/students",
        title: "Student admissions",
        description: "Enroll students and review the roster.",
        icon: GraduationCap,
        roles: ["super_admin"],
      },
      {
        href: "/students",
        title: "Students",
        description: "Names, parent contact, and attendance.",
        icon: ContactRound,
        roles: ["super_admin", "teacher"],
      },
      {
        href: "/students/class-change",
        title: "Class change",
        description:
          "Move a student to a new class. Fees follow that class from the month you choose.",
        icon: School,
        roles: ["super_admin"],
      },
      {
        href: "/students/transfer-certificate",
        title: "Transfer certificate",
        description:
          "Withdraw a student from school. Past fees and marks stay on record.",
        icon: FileText,
        roles: ["super_admin"],
      },
      {
        href: "/admin/users",
        title: "Staff",
        description: "Accounts, roles, monthly salary, and joining date.",
        icon: Users,
        roles: ["super_admin"],
      },
      {
        href: "/admin/staff-attendance",
        title: "Staff attendance",
        description: "Mark staff present, absent, or late.",
        icon: UserCheck,
        roles: ["super_admin"],
      },
    ],
  },
  {
    label: "Academics",
    links: [
      {
        href: "/classes",
        title: "Classes & fees",
        description: "Create classes and set tuition structures.",
        icon: School,
        roles: ["super_admin"],
      },
      {
        href: "/timetable",
        title: "Timetable",
        description: "Weekly class schedule.",
        icon: CalendarDays,
        roles: ["super_admin", "teacher", "student", "parent"],
      },
      {
        href: "/admin/teachers-timetable",
        title: "Teachers timetable",
        description: "Look up any teacher's weekly schedule.",
        icon: CalendarRange,
        roles: ["super_admin"],
        alsoStaffRoles: ["incharge"],
      },
      {
        href: "/teacher/attendance",
        title: "Attendance",
        description: "Mark a class present, absent, or late.",
        icon: ClipboardCheck,
        roles: ["teacher"],
        staffRoles: ["class_teacher"],
      },
      {
        href: "/teacher/attendance",
        title: "Attendance",
        description: "See which of your classes have submitted attendance.",
        icon: ClipboardCheck,
        roles: ["teacher"],
        staffRoles: ["incharge"],
      },
      {
        href: "/admin/free-classes",
        title: "Free classes",
        description: "Assign a cover teacher for your classes.",
        icon: CalendarOff,
        roles: ["teacher"],
        staffRoles: ["incharge"],
      },
      {
        href: "/classwork",
        title: "Classwork",
        description: "Enter the day's classwork from your timetable.",
        icon: PencilLine,
        roles: ["teacher"],
      },
      {
        href: "/homework",
        title: "Homework",
        description: "Enter the day's homework from your timetable.",
        icon: NotebookPen,
        roles: ["teacher"],
      },
      {
        href: "/assignment",
        title: "Assignment",
        description: "Review and edit homework and classwork by class and date.",
        icon: ClipboardList,
        roles: ["super_admin", "teacher"],
        staffRoles: ["incharge"],
      },
      {
        href: "/report-cards",
        title: "Report cards",
        description: "Create a term report with subject marks and attendance.",
        icon: FileText,
        roles: ["super_admin", "teacher"],
      },
    ],
  },
  {
    label: "Office",
    links: [
      {
        href: "/transport",
        title: "Transport",
        description: "Bus routes, student assignment, and custom fares.",
        icon: Bus,
        roles: ["super_admin"],
      },
      {
        href: "/fuel",
        title: "Fuel",
        description: "Bus fuel purchases, mileage, and monthly expense.",
        icon: Fuel,
        roles: ["super_admin"],
      },
      {
        href: "/admin/staff-payments",
        title: "Staff payments",
        description: "Record monthly salary payments for staff.",
        icon: Wallet,
        roles: ["super_admin"],
      },
      {
        href: "/stock/inventory",
        title: "Stock management",
        description: "Office inventory, and items given or lent.",
        icon: Boxes,
        roles: ["super_admin"],
        staffRoles: ["incharge"],
      },
      {
        href: "/admin/fees",
        title: "Fees",
        description: "Collect academic and transport fees.",
        icon: Receipt,
        roles: ["super_admin", "parent", "student"],
      },
      {
        href: "/expenses",
        title: "Expenses",
        description: "Record office expenses with an amount and description.",
        icon: Wallet,
        roles: ["super_admin"],
      },
    ],
  },
];

export default function DashboardPage() {
  const me = useQuery(api.users.me);

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;
  }
  if (me === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Signed in, but no user profile was found.
      </p>
    );
  }

  const role = isSchoolAdmin(me) ? "super_admin" : me.role;
  const roleLabel =
    me.staffRole === "data_entry"
      ? "data entry"
      : me.staffRole === "observer"
        ? "observer"
      : me.staffRole === "incharge"
        ? "incharge"
        : me.role.replace("_", " ");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{me.name ? `, ${me.name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground capitalize">{roleLabel}</p>
      </div>
      <DashboardOverview />
      {GROUPS.map((group) => {
        const links = group.links.filter((link) => {
          return canOpenNavItem(link, role, me.staffRole);
        });
        if (links.length === 0) {
          return null;
        }
        return (
          <section key={group.label} className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {links.map((link) => {
                const Icon = link.icon;
                return (
                  <Link key={`${link.href}-${link.title}`} href={link.href}>
                    <Card className="h-full bg-card shadow-sm transition-colors hover:bg-accent/60">
                      <CardHeader>
                        <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </div>
                        <CardTitle>{link.title}</CardTitle>
                        <CardDescription>{link.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
