import { getSessionCookie } from "better-auth/cookies"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { auth } from "./lib/auth"

export async function middleware(request: NextRequest) {
  const cookies = getSessionCookie(request)
  if (!(cookies || request.nextUrl.pathname.includes("/signin"))) {
    return NextResponse.redirect(new URL("/signin", request.url))
  }

  // Verify the session is valid
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session) {
    return NextResponse.redirect(new URL("/signin", request.url))
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-url", request.url)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  runtime: "nodejs",
  matcher: [
    "/((?!api|webchat|signin|integrations|zalo_verifier|pricing|assets|_next/static|_next/image|favicon.ico|avatars|.*.svg).*)",
  ],
}
