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
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="justify-items-center text-center">
          <img
            src="/shaheen-academy-logo.svg"
            alt=""
            className="h-16 w-auto"
          />
          <CardTitle>SACH</CardTitle>
          <CardDescription>Sign in with your school account.</CardDescription>
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
  );
}
