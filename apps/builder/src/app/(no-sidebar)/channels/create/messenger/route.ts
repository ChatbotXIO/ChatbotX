import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { connectionService, failSession } from "@chatbotx.io/connections"
import type { MessengerCredential } from "@chatbotx.io/database/partials"
import type { AuthValue } from "@chatbotx.io/sdk"
import type { NextRequest } from "next/server"
import type {
  BeforeStartContext,
  BeforeStartResult,
} from "@/features/channel-connect/lib/start-channel-connect"
import { startChannelConnect } from "@/features/channel-connect/lib/start-channel-connect"
import { tryReuseFacebookSsoToken } from "@/features/integration-messenger/libs/sso-reuse"
import { logger } from "@/lib/log"

const MESSENGER_SELECT_PATH = (sessionId: string) =>
  `/channels/messenger/select?session=${sessionId}`

/**
 * The Facebook SSO token reuse check: on a hit, mints its own `ConnectSession`
 * (no OAuth round trip, so no callback to build it in — the write can't
 * happen from a Server Component's render) and attaches candidates straight
 * away, then redirects to the picker. On a miss, or if `listAndAttachCandidates`
 * itself throws after the session was created, this falls back to the normal
 * OAuth start instead of showing a hard error — the SSO reuse is purely an
 * optimization, never the only way to connect.
 */
async function tryMessengerSsoReuse({
  userId,
  platformOwnerId,
  targetWorkspacePromise,
  credential,
}: BeforeStartContext): Promise<BeforeStartResult> {
  const messengerCredential = credential as MessengerCredential
  // Independent of each other — the SSO check needs only the credential,
  // and workspace resolve-or-create needs only the request — so they run
  // concurrently instead of waiting on the workspace first.
  const [targetWorkspace, reuse] = await Promise.all([
    targetWorkspacePromise,
    tryReuseFacebookSsoToken({ userId, messengerCredential }),
  ])
  if (!reuse.reusable) {
    return { type: "continue" }
  }

  let createdSessionId: string | undefined
  try {
    const { session } = await connectSessionService.create({
      workspaceId: targetWorkspace.id,
      provider: "messenger",
      purpose: "connect",
      actorUserId: userId,
      platformOwnerId,
    })
    createdSessionId = session.id
    const auth: AuthValue = {
      authType: "oauth2",
      clientId: messengerCredential.clientId,
      clientSecret: messengerCredential.clientSecret,
      redirectUrl: "",
      version: messengerCredential.version,
      tokens: { accessToken: reuse.userToken },
    }
    await connectionService.listAndAttachCandidates(session, auth)
    return { type: "redirect", url: MESSENGER_SELECT_PATH(session.id) }
  } catch (err) {
    logger.error(
      { err, workspaceId: targetWorkspace.id, sessionId: createdSessionId },
      "Facebook SSO reuse failed for messenger connect; falling back to OAuth",
    )
    if (createdSessionId) {
      await failSession(
        {
          id: createdSessionId,
          workspaceId: targetWorkspace.id,
          provider: "messenger",
        },
        "internal_error",
      ).catch(() => undefined)
    }
    return { type: "continue" }
  }
}

/**
 * Reached only via a redirect from `/channels/create?channel=messenger`
 * (never linked to directly). The Facebook SSO token reuse check needs to
 * mint a `ConnectSession` synchronously on a hit — no OAuth round-trip, so
 * there is no callback to build it in — and that write can't happen from a
 * Server Component's render. `startChannelConnect` re-runs the auth/
 * workspace guards itself since this is a public GET endpoint, not just an
 * internal helper.
 *
 * Both branches resolve (or create) the target workspace up front, unlike
 * the legacy cookie-based flow which deferred that to the OAuth callback:
 * `ConnectSession.workspaceId` is a required column, so a session cannot be
 * minted for a not-yet-existing workspace the way the old base64 `state`
 * blob could carry an absent `workspaceId` and let the callback create one.
 */
export async function GET(req: NextRequest) {
  return await startChannelConnect(req, {
    provider: "messenger",
    selectPath: MESSENGER_SELECT_PATH,
    beforeStart: tryMessengerSsoReuse,
  })
}
