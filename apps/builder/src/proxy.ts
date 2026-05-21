import {
  getPublicHostFromRequest,
  getPublicOriginFromRequest,
  getPublicProtocolFromRequest,
} from "@chatbotx.io/sdk"
import { getSessionCookie } from "better-auth/cookies"
import { headers } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"
import { httpLogger } from "./lib/log"

const publicRoutes = ["/integrations", "/r", "/auth", "/api"]
const signinPath = "/auth/sign-in"

async function _logRequest(request: NextRequest) {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: safe to use any
    const headers = Object.fromEntries(request.headers as any)
    const body = await request.clone().json()
    httpLogger.info(
      {
        headers,
        body,
      },
      `LOG ${request.method} ${request.url}`,
    )
  } catch {
    // Body might be empty or not JSON
    httpLogger.info(
      {
        headers,
      },
      `LOG ${request.method} ${request.url} (Empty or not JSON)`,
    )
  }
}

export async function proxy(request: NextRequest) {
  // await logRequest(request)

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
  const originUrl = new URL(request.url)
  originUrl.host = getPublicHostFromRequest(request)
  originUrl.protocol = getPublicProtocolFromRequest(request)
  originUrl.port = ""

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-url", originUrl.toString())

  const hostname = originUrl.hostname
  const parts = hostname.split(".")
  // For single-part hostnames (localhost, bare IP), use as-is to avoid breaking local dev.
  const domain = parts.length > 1 ? parts.slice(-2).join(".") : hostname
  requestHeaders.set("x-domain", domain)

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
    "/((?!webchat|zalo_verifier|pricing|chat-widget|assets|_next/static|_next/image|favicon.ico|avatars|.*.svg|brand|openapi.json).*)",
  ],
}
