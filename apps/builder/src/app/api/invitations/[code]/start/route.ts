import {
  INVITATION_COOKIE_MAX_AGE_SECONDS,
  INVITATION_COOKIE_NAME,
} from "@chatbotx.io/auth/server"
import { resolveTenantByDomain } from "@chatbotx.io/auth/tenant"
import { invitationService } from "@chatbotx.io/business"
import { getPublicUrlFromRequest } from "@chatbotx.io/utils"
import { NextResponse } from "next/server"
import { getDomainFromHeader } from "@/lib/domain"

export async function GET(
  request: Request,
  props: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await props.params
  const publicUrl = getPublicUrlFromRequest(request)
  const tenantId = await resolveTenantByDomain(await getDomainFromHeader())
  const invitation = await invitationService.findActiveByCode(code, {
    tenantId,
  })
  if (!invitation) {
    return NextResponse.redirect(
      new URL("/auth/sign-in?error=invalid_invitation", publicUrl),
      302,
    )
  }

  const signUpUrl = new URL("/auth/sign-up", publicUrl)
  signUpUrl.searchParams.set("callbackURL", `/invitations/${code}`)
  const response = NextResponse.redirect(signUpUrl, 302)
  response.cookies.set({
    name: INVITATION_COOKIE_NAME,
    value: code,
    httpOnly: true,
    maxAge: INVITATION_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
  return response
}
