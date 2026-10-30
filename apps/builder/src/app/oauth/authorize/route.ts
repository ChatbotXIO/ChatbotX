import { getPublicOriginFromRequest } from "@chatbotx.io/utils"
import { NextResponse } from "next/server"

export const GET = (request: Request) => {
  // The Better Auth MCP plugin never reads stored consent rows, so this is
  // the only way to guarantee that the authorization screen is shown. It is
  // forced even over a client-sent prompt: the consent screen is where the
  // workspace is chosen, and a token without a consent is rejected.
  const params = new URL(request.url).searchParams
  params.set("prompt", "consent")

  const publicOrigin = getPublicOriginFromRequest(request)
  return NextResponse.redirect(
    new URL(`/api/auth/oauth2/authorize?${params}`, publicOrigin),
    302,
  )
}
