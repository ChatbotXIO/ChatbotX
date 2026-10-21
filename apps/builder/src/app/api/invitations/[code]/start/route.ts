import {
  INVITATION_COOKIE_MAX_AGE_SECONDS,
  INVITATION_COOKIE_NAME,
} from "@chatbotx.io/auth/server"
import { resolveTenantByDomain } from "@chatbotx.io/auth/tenant"
import { invitationService } from "@chatbotx.io/business"
import { getPublicUrlFromRequest } from "@chatbotx.io/utils"
import { NextResponse } from "next/server"
import { getDomainFromHeader } from "@/lib/domain"
import { checkApiRateLimit } from "@/lib/rate-limit/api-rate-limit"
import {
  getGuestClientIp,
  UNKNOWN_CLIENT_IP,
} from "@/lib/rate-limit/guest-rate-limit"

/**
 * Per 10-second window, see `checkApiRateLimit`. The code is now CSPRNG
 * (unguessable on its own), so this is defense in depth against a brute-force
 * sweep rather than the primary control.
 */
const START_LIMIT_PER_IP = 20
// Callers behind a proxy that sets no client-IP header all share one bucket,
// so it needs head-room, but must still exist.
const START_LIMIT_UNKNOWN_IP = 100

export async function GET(
  request: Request,
  props: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await props.params
  const publicUrl = getPublicUrlFromRequest(request)

  const clientIp = getGuestClientIp(request.headers)
  const rateLimit = await checkApiRateLimit({
    scope: "invitation-start-rate-limit",
    key: clientIp,
    limit:
      clientIp === UNKNOWN_CLIENT_IP
        ? START_LIMIT_UNKNOWN_IP
        : START_LIMIT_PER_IP,
  })
  if (rateLimit.limited) {
    return new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfter) },
    })
  }

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
