import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const cookies = getSessionCookie(request)
  if (!cookies && request.nextUrl.pathname !== "/signin") {
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
  matcher: [
    "/((?!api|integrations|assets|_next/static|_next/image|favicon.ico|avatars|.*.svg).*)",
  ],
}
