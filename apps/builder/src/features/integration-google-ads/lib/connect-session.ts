import { connectSessionService } from "@chatbotx.io/business/connect-session"
import type { ConnectSessionModel } from "@chatbotx.io/database/types"
import { env } from "@/env"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { googleAdsException } from "./assert-can-manage-google-ads"
import { GOOGLE_ADS_PROVIDER, SESSION_QUERY_PARAM } from "./constants"

/**
 * Absolute settings URL the OAuth round-trip returns to. The engine accepts
 * only an absolute URL on an allow-listed origin (`sanitizeOptionalReturnUrl`
 * in `lib/oauth-referer.ts`) and stores it as a relative path. The callback
 * never appends the session id, so `pointReturnUrlAtSession` adds it once the
 * session exists.
 */
export async function buildSettingsReturnUrl(
  workspaceId: string,
): Promise<string> {
  const requestUrl = await getOriginUrlFromHeader()
  const base = requestUrl || env.NEXT_PUBLIC_BUILDER_URL
  return new URL(
    `/space/${workspaceId}/settings/integrations/google-ads`,
    base,
  ).toString()
}

/**
 * Rewrites the freshly created session's return URL to carry its own id
 * (`?session={id}`), so the settings page can show the outcome of the OAuth
 * round trip even when it ended in a terminal state (denied, failed, expired)
 * that the in-flight lookup no longer returns.
 */
export async function pointReturnUrlAtSession(
  session: ConnectSessionModel | null,
): Promise<void> {
  if (!session) {
    return
  }
  const base =
    session.returnUrl ??
    `/space/${session.workspaceId}/settings/integrations/google-ads`
  const url = new URL(base, "http://x.invalid")
  url.searchParams.set(SESSION_QUERY_PARAM, session.id)
  await connectSessionService.updateReturnUrl({
    id: session.id,
    returnUrl: `${url.pathname}${url.search}`,
  })
}

/**
 * Loads a connect session scoped to the workspace and refuses anything that is
 * not a Google Ads one. A foreign / unknown / other-provider id all answer the
 * same "not found" so the id space is not probeable.
 */
export async function requireGoogleAdsSession(input: {
  sessionId: string
  workspaceId: string
}): Promise<ConnectSessionModel> {
  const session = await connectSessionService.findByIdForWorkspace({
    id: input.sessionId,
    workspaceId: input.workspaceId,
  })
  if (!session || session.provider !== GOOGLE_ADS_PROVIDER) {
    throw await googleAdsException("sessionNotFound", 404)
  }
  return session
}

/** The consent URL of a freshly started session, or a typed refusal. */
export async function requireConsentUrl(
  session: ConnectSessionModel | null,
): Promise<string> {
  const action = session?.nextAction
  if (action?.type !== "open_url") {
    throw await googleAdsException("authorizationUnavailable", 502)
  }
  return action.url
}
