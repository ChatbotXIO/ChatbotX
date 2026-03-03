import { getSessionCookie } from "better-auth/cookies"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"

const publicRoutes = ["/integrations"]

export async function proxy(request: NextRequest) {
  if (isPublicRoute(request.nextUrl.pathname)) {
    return attachProxyUrl(request)
  }

  const cookies = getSessionCookie(request)

  const fallbackSigninUrl = new URL("/auth/sign-in", request.url)
  fallbackSigninUrl.searchParams.set("callbackURL", request.url)

  if (!(cookies || request.nextUrl.pathname.includes("/auth/sign-in"))) {
    return NextResponse.redirect(fallbackSigninUrl)
  }

  // Verify the session is valid
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session) {
    return NextResponse.redirect(fallbackSigninUrl)
  }

  return attachProxyUrl(request)
}

function attachProxyUrl(request: NextRequest): NextResponse {
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

function isPublicRoute(pathname: string) {
  for (const route of publicRoutes) {
    if (pathname.startsWith(route)) {
      return true
    }
  }
  return false
}

export const config = {
  matcher: [
    "/((?!api|webchat|auth|zalo_verifier|pricing|chat-widget|assets|_next/static|_next/image|favicon.ico|avatars|.*.svg|brand|openapi.json).*)",
  ],
}
