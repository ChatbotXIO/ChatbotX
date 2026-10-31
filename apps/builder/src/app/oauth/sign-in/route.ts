import { getPublicOriginFromRequest } from "@chatbotx.io/utils"
import { NextResponse } from "next/server"

export const GET = (request: Request) => {
  const url = new URL(request.url)
  return NextResponse.redirect(
    new URL(
      `/api/auth/oauth2/authorize?${url.searchParams}`,
      getPublicOriginFromRequest(request),
    ),
    302,
  )
}
