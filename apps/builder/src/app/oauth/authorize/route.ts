import { getPublicOriginFromRequest } from "@chatbotx.io/utils"
import { NextResponse } from "next/server"

export const GET = (request: Request) => {
  const params = new URL(request.url).searchParams
  const publicOrigin = getPublicOriginFromRequest(request)

  return NextResponse.redirect(
    new URL(`/api/auth/oauth2/authorize?${params}`, publicOrigin),
    302,
  )
}
