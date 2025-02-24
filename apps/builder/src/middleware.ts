import NextAuth from "next-auth"
import { NextResponse } from "next/server"
import { providers } from "./auth.config"

export const { auth } = NextAuth({ providers })

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname !== "/signin") {
    const newUrl = new URL("/signin", req.nextUrl.origin)

    return Response.redirect(newUrl)
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-url", req.url)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
})

export const config = {
  matcher: [
    "/((?!api|integrations|_next/static|_next/image|favicon.ico|avatars|.*.svg).*)",
  ],
}
