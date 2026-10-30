import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/sign-in"]);
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/admin(.*)",
  "/teacher(.*)",
  "/timetable(.*)",
  "/classes(.*)",
  "/transport(.*)",
  "/students(.*)",
  "/report-cards(.*)",
  "/homework(.*)",
  "/classwork(.*)",
  "/assignment(.*)",
]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const { pathname } = request.nextUrl;
  if (pathname === "/homework/classes" || pathname === "/classwork/classes") {
    return nextjsMiddlewareRedirect(request, "/assignment");
  }
  // The session cookie is enough for this gate. isAuthenticated() asks Convex
  // on every request, which stalls client navigations. Convex functions still
  // check identity and role before returning data.
  const token = await convexAuth.getToken();
  if (isProtectedRoute(request) && !token) {
    return nextjsMiddlewareRedirect(request, "/sign-in");
  }
  if (isSignInPage(request) && token) {
    return nextjsMiddlewareRedirect(request, "/dashboard");
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
