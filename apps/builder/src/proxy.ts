import { getSessionCookie } from "better-auth/cookies"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { getPublicOriginFromRequest } from "@/lib/domain"

const publicRoutes = ["/integrations"]
const signinPath = "/auth/sign-in"

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (isPublicRoute(pathname)) {
    return attachProxyUrl(request)
  }

  const cookies = getSessionCookie(request)
  if (!cookies) {
    return NextResponse.redirect(buildSigninUrl(request, pathname, search))
  }

  // Verify the session is valid
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session) {
    return NextResponse.redirect(buildSigninUrl(request, pathname, search))
  }

  return attachProxyUrl(request)
}

function attachProxyUrl(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl
  const proxyUrl = `${getPublicOriginFromRequest(request)}${pathname}${search}`

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-url", proxyUrl)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

function buildSigninUrl(
  request: NextRequest,
  pathname: string,
  search: string,
): URL {
  const publicOrigin = getPublicOriginFromRequest(request)
  const signinUrl = new URL(signinPath, publicOrigin)
  signinUrl.searchParams.set(
    "callbackURL",
    `${publicOrigin}${pathname}${search}`,
  )
  return signinUrl
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
