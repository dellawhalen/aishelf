import { auth } from "@/auth";
import { isDevelopmentAuthBypassEnabled, isWorkspaceUserAllowed } from "@/lib/workspace-authorization";
import { NextResponse } from "next/server";

export default auth((request) => {
  const { pathname } = request.nextUrl;
  if (
    pathname === "/api/auth"
    || pathname.startsWith("/api/auth/")
    || pathname === "/sign-in"
    || pathname.startsWith("/sign-in/")
    || pathname === "/sign-up"
    || pathname.startsWith("/sign-up/")
  ) {
    return NextResponse.next();
  }

  if (isDevelopmentAuthBypassEnabled(process.env.NODE_ENV, process.env.AISHELF_TEST_AUTH_BYPASS)) {
    return NextResponse.next();
  }

  const allowedUserIds = process.env.AISHELF_ALLOWED_USER_IDS;
  const userId = request.auth?.user?.id ?? null;
  if (pathname.startsWith("/api/")) {
    if (!allowedUserIds?.trim()) {
      return NextResponse.json(
        { error: "AIShelf workspace access is not configured." },
        { status: 503 },
      );
    }
    if (!userId) {
      return NextResponse.json({ error: "Sign in to access AIShelf." }, { status: 401 });
    }
    if (!isWorkspaceUserAllowed(userId, allowedUserIds)) {
      return NextResponse.json(
        { error: "This account is not authorized to access this AIShelf workspace." },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  if (isWorkspaceUserAllowed(userId, allowedUserIds)) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/sign-in", request.url);
  if (userId) {
    signInUrl.searchParams.set("error", allowedUserIds?.trim() ? "AccessDenied" : "WorkspaceNotConfigured");
  }
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
