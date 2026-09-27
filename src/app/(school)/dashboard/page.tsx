"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const LINKS = [
  {
    href: "/admin/students",
    title: "Student admissions",
    description: "Enroll students and review the roster.",
    roles: ["super_admin"],
  },
  {
    href: "/students",
    title: "Students",
    description: "Names, parent contact, and attendance.",
    roles: ["super_admin", "teacher"],
  },
  {
    href: "/classes",
    title: "Classes & fees",
    description: "Create classes and set tuition structures.",
    roles: ["super_admin"],
  },
  {
    href: "/transport",
    title: "Transport",
    description: "Bus routes, student assignment, and custom fares.",
    roles: ["super_admin"],
  },
  {
    href: "/teacher/attendance",
    title: "Attendance",
    description: "Mark a class present, absent, or late.",
    roles: ["super_admin", "teacher"],
  },
  {
    href: "/report-cards",
    title: "Report cards",
    description: "Create a term report with subject marks and attendance.",
    roles: ["super_admin", "teacher"],
  },
  {
    href: "/timetable",
    title: "Timetable",
    description: "Weekly class schedule.",
    roles: ["super_admin", "teacher", "student", "parent"],
  },
  {
    href: "/admin/fees",
    title: "Fees",
    description: "Collect academic and transport fees.",
    roles: ["super_admin", "parent", "student"],
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{me.name ? `, ${me.name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {me.role.replace("_", " ")}.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {LINKS.filter((link) => link.roles.includes(me.role)).map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle>{link.title}</CardTitle>
                <CardDescription>{link.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
