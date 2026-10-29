import { getPublicOriginFromRequest } from "@chatbotx.io/utils"
import { NextResponse } from "next/server"

export const GET = (request: Request) => {
  // The Better Auth MCP plugin never reads stored consent rows, so this is
  // the only way to guarantee that the authorization screen is shown.
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
