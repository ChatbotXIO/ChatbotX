import NextAuth from "next-auth"
import { NextResponse } from "next/server"
import { providers } from "./auth.config"

export const { auth } = NextAuth({ providers })

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname !== "/signin") {
    const newUrl = new URL("/signin", req.nextUrl.origin)

    return Response.redirect(newUrl)
  }

  const headers = new Headers(req.headers)
  headers.set("x-current-path", req.nextUrl.pathname)

  return NextResponse.next({ headers })
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|avatars|.*.svg).*)"],
}
