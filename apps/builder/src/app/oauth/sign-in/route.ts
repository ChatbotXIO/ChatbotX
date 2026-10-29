import { getPublicOriginFromRequest } from "@chatbotx.io/utils"
import { NextResponse } from "next/server"

export const GET = (request: Request) => {
  const url = new URL(request.url)
  const response = NextResponse.redirect(
    new URL(
      `/oauth/authorize?${url.searchParams}`,
      getPublicOriginFromRequest(request),
    ),
    302,
  )
  response.cookies.set("oidc_login_prompt", "", { path: "/", maxAge: 0 })

  return response
}
