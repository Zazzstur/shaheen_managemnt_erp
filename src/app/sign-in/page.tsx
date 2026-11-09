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

type FormValues = {
  email: string;
  password: string;
};

export default function SignInPage() {
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const submit = async () => {
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
        flow: "signIn",
      });
      toast.success("Signed in");
    } catch (error) {
      toast.error(mutationResult(error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-background md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground md:flex">
        <div>
          <img
            src="/shaheen-academy-logo.svg"
            alt=""
            className="h-20 w-auto"
          />
          <h1 className="mt-8 text-3xl font-semibold tracking-tight">
            Shaheen Academy
          </h1>
          <p className="mt-2 text-sidebar-primary">Champawat</p>
        </div>
        <p className="max-w-sm text-sm text-sidebar-foreground/75">
          Admissions, attendance, timetable, and fees for the school office.
        </p>
      </div>
      <div className="flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="justify-items-center text-center">
          <img
            src="/shaheen-academy-logo.svg"
            alt=""
            className="h-16 w-auto md:hidden"
          />
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your Shaheen Academy account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...form.register("email")} />
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
            onClick={() => void submit()}
          >
            {pending ? "Please wait…" : "Sign in"}
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
