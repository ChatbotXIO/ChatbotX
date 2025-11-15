import { getSessionCookie } from "better-auth/cookies"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"

export async function proxy(request: NextRequest) {
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

  // Calculate proxy url
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host")
  const protocol = request.headers.get("x-forwarded-proto") || "https"
  const proxyUrl = `${protocol}://${host}${request.nextUrl.pathname}${request.nextUrl.search}`

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-url", proxyUrl)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: [
    "/((?!api|webchat|signin|integrations|zalo_verifier|pricing|assets|_next/static|_next/image|favicon.ico|avatars|.*.svg).*)",
  ],
}
