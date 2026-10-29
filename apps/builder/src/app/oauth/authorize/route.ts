import { getPublicOriginFromRequest } from "@chatbotx.io/utils"
import { NextResponse } from "next/server"

export const GET = (request: Request) => {
  const params = new URL(request.url).searchParams
  if (!params.has("prompt")) {
    params.set("prompt", "consent")
  }

  const publicOrigin = getPublicOriginFromRequest(request)
  return NextResponse.redirect(
    new URL(`/api/auth/mcp/authorize?${params}`, publicOrigin),
    302,
  )
}
