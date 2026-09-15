import {
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import "@chatbotx.io/business/audit"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { connectionService } from "@chatbotx.io/connections"
import type { AuthValue } from "@chatbotx.io/sdk"
import { notFound, redirect } from "next/navigation"
import type { NextRequest } from "next/server"
import { resolveOAuthCredential } from "@/features/connections/lib/resolve-connect-credential"
import { tryReuseFacebookSsoToken } from "@/features/integration-messenger/libs/sso-reuse"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserId } from "@/lib/auth/utils"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
import { createFirstWorkspace } from "@/lib/workspace/create-first-workspace"

/**
 * Reached only via a redirect from `/channels/create?channel=messenger`
 * (never linked to directly). The Facebook SSO token reuse check needs to
 * mint a `ConnectSession` synchronously on a hit — no OAuth round-trip, so
 * there is no callback to build it in — and that write can't happen from a
 * Server Component's render. This route re-runs the auth/workspace guards
 * itself since it's a public GET endpoint, not just an internal helper.
 *
 * Both branches resolve (or create) the target workspace up front, unlike
 * the legacy cookie-based flow which deferred that to the OAuth callback:
 * `ConnectSession.workspaceId` is a required column, so a session cannot be
 * minted for a not-yet-existing workspace the way the old base64 `state`
 * blob could carry an absent `workspaceId` and let the callback create one.
 */
export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get("workspaceId") ?? undefined

  if (workspaceId) {
    await requireWorkspacePermission(workspaceId, "superAdmin")
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const platformOwnerId = await resolvePlatformOwnerId({ userId, workspaceId })

  const messenger = await platformCredentialService.resolveForOwner({
    ownerId: platformOwnerId,
    type: "messenger",
  })
  if (!messenger) {
    return notFound()
  }

  const targetWorkspace = workspaceId
    ? await workspaceService.findById({ id: workspaceId })
    : await createFirstWorkspace(userId)

  const reuse = await tryReuseFacebookSsoToken({
    userId,
    messengerCredential: messenger.config,
  })

  if (reuse.reusable) {
    const { session } = await connectSessionService.create({
      workspaceId: targetWorkspace.id,
      provider: "messenger",
      purpose: "connect",
      actorUserId: userId,
      platformOwnerId,
    })
    const auth: AuthValue = {
      authType: "oauth2",
      clientId: messenger.config.clientId,
      clientSecret: messenger.config.clientSecret,
      redirectUrl: "",
      version: messenger.config.version,
      tokens: { accessToken: reuse.userToken },
    }
    await connectionService.listAndAttachCandidates(session, auth)
    redirect(`/channels/messenger/select?session=${session.id}`)
  }

  const resolved = await resolveOAuthCredential({
    provider: "messenger",
    ownerId: platformOwnerId,
  })
  if (!resolved) {
    return notFound()
  }

  const { session, nextAction } = await connectionService.startSession({
    workspaceId: targetWorkspace.id,
    provider: "messenger",
    purpose: "connect",
    credential: resolved.credential,
    callbackUrl: resolved.callbackUrl,
    actorUserId: userId,
    platformOwnerId,
  })
  // The session's own id isn't known until `startSession` returns, so the
  // page-picker redirect target — which the select page needs to resolve
  // this same session via `?session=` — is set in a follow-up call rather
  // than passed into `startSession` itself.
  await connectSessionService.updateReturnUrl({
    id: session.id,
    returnUrl: `/channels/messenger/select?session=${session.id}`,
  })
  if (nextAction.type !== "open_url") {
    throw new Error(
      `Unexpected connect next action for messenger: ${nextAction.type}`,
    )
  }
  redirect(nextAction.url)
}
