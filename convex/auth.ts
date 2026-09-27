import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { isSignupRole } from "./lib/roles";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        const name = String(params.name ?? email).trim();
        const role = isSignupRole(params.role) ? params.role : "student";
        return {
          email,
          name,
          role,
          status: "active" as const,
        };
      },
    }),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, args) {
      if (args.existingUserId) {
        return;
      }
      const existing = await ctx.db.query("users").take(2);
      const hasAdmin = existing.some(
        (user) => "role" in user && user.role === "super_admin",
      );
      if (!hasAdmin) {
        await ctx.db.patch(args.userId, {
          role: "super_admin",
          status: "active",
        });
      }
    },
  },
});
