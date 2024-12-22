import NextAuth from "next-auth"
import authConfig from "./auth.config"
import { NextResponse } from "next/server";

export const { auth } = NextAuth(authConfig)

export default auth((req) => {
  // Auth middleware
  if (!req.auth && req.nextUrl.pathname !== "/login") {
    const newUrl = new URL("/login", req.nextUrl.origin)

    return Response.redirect(newUrl)
  }

  // Custom header middleware
  if (req.nextUrl.pathname.startsWith('/chatbots')) {
    const headers = new Headers(req.headers);

    headers.set("x-current-path", req.nextUrl.pathname);
    return NextResponse.next({ headers });
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
