import { getPublicOriginFromRequest } from "@chatbotx.io/utils"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth/auth"

const requiresFreshSignIn = (params: URLSearchParams): boolean => {
  const prompt = params.get("prompt")?.split(" ") ?? []
  return (
    params.has("max_age") ||
    prompt.includes("login") ||
    prompt.includes("create")
  )
}

export const GET = async (request: Request) => {
  const url = new URL(request.url)
  const origin = getPublicOriginFromRequest(request)
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session || requiresFreshSignIn(url.searchParams)) {
    return NextResponse.redirect(
      new URL(`/auth/sign-in?${url.searchParams}`, origin),
      302,
    )
  }

  return NextResponse.redirect(
    new URL(`/api/auth/oauth2/authorize?${url.searchParams}`, origin),
    302,
  )
}
