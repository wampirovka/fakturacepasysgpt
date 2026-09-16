import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/prihlaseni", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/faktury/:path*",
    "/zalohy/:path*",
    "/uhrady/:path*",
    "/pokladna/:path*",
    "/zakaznici/:path*",
    "/prehledy/:path*",
    "/nastaveni/:path*",
    "/ucet/:path*",
  ],
};
