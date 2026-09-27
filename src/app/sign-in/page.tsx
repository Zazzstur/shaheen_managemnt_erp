"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { signInSchema } from "@/lib/schemas";
import { mutationResult } from "@/lib/result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type FormValues = {
  email: string;
  password: string;
  name?: string;
  role?: "teacher" | "student" | "parent";
};

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
      name: "",
      role: "teacher",
    },
  });

  const submit = async (flow: "signIn" | "signUp") => {
    const parsed = signInSchema.safeParse(form.getValues());
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid form");
      return;
    }
    setPending(true);
    try {
      await signIn("password", {
        email: parsed.data.email,
        password: parsed.data.password,
        name: parsed.data.name || parsed.data.email,
        role: parsed.data.role ?? "student",
        flow,
      });
      toast.success(flow === "signIn" ? "Signed in" : "Account created");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>School Management</CardTitle>
          <CardDescription>
            The first account created becomes super admin. Later sign-ups use
            the selected role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="sign-in">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sign-in">Sign in</TabsTrigger>
              <TabsTrigger value="sign-up">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="sign-in" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register("email")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  {...form.register("password")}
                />
              </div>
              <Button
                className="w-full"
                disabled={pending}
                onClick={() => void submit("signIn")}
              >
                {pending ? "Please wait…" : "Sign in"}
              </Button>
            </TabsContent>
            <TabsContent value="sign-up" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" {...form.register("name")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  {...form.register("email")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  {...form.register("password")}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={form.watch("role")}
                  items={{
                    teacher: "Teacher",
                    student: "Student",
                    parent: "Parent",
                  }}
                  onValueChange={(value) => {
                    if (
                      value === "teacher" ||
                      value === "student" ||
                      value === "parent"
                    ) {
                      form.setValue("role", value);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="teacher">Teacher</SelectItem>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="parent">Parent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={pending}
                onClick={() => void submit("signUp")}
              >
                {pending ? "Please wait…" : "Create account"}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
