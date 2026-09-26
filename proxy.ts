import { NextResponse, type NextRequest } from "next/server";

/* Next 16 calls this file proxy.ts (it was middleware.ts).
 *
 * A fast first gate: page requests without a session cookie go straight to the
 * login page, so nothing flashes before a redirect. It only checks that a
 * cookie is present - validating it needs the database, which happens in
 * every server action and in the layout. This is a courtesy, not the lock. */

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (req.method !== "GET") return NextResponse.next();
  const hasSession = Boolean(req.cookies.get("bsi_session")?.value);
  if (!hasSession && pathname !== "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
