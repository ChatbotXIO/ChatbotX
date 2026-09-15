import { workspaceService } from "@chatbotx.io/business"
import "@chatbotx.io/business/audit"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { connectionService } from "@chatbotx.io/connections"
import { notFound, redirect } from "next/navigation"
import type { NextRequest } from "next/server"
import { resolveOAuthCredential } from "@/features/connections/lib/resolve-connect-credential"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserId } from "@/lib/auth/utils"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
import { createFirstWorkspace } from "@/lib/workspace/create-first-workspace"

/**
 * Reached only via a redirect from `/channels/create?channel=instagram-direct`
 * (never linked to directly). Extracted out of `channels/create/page.tsx`'s
 * inline `generateInstagramRedirectUri` call — a Server Component's render
 * can't itself start a `ConnectSession` down a path that could redirect to
 * `/channels/create?error=...` (see `createFirstWorkspace`), so this mirrors
 * Messenger's dedicated create route.
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

  const resolved = await resolveOAuthCredential({
    provider: "instagram",
    ownerId: platformOwnerId,
  })
  if (!resolved) {
    return notFound()
  }

  const targetWorkspace = workspaceId
    ? await workspaceService.findById({ id: workspaceId })
    : await createFirstWorkspace(userId)

  const { session, nextAction } = await connectionService.startSession({
    workspaceId: targetWorkspace.id,
    provider: "instagram",
    purpose: "connect",
    credential: resolved.credential,
    callbackUrl: resolved.callbackUrl,
    actorUserId: userId,
    platformOwnerId,
  })
  // The session's own id isn't known until `startSession` returns, so the
  // confirm-screen redirect target — which the select page needs to resolve
  // this same session via `?session=` — is set in a follow-up call rather
  // than passed into `startSession` itself.
  await connectSessionService.updateReturnUrl({
    id: session.id,
    returnUrl: `/channels/instagram/select?session=${session.id}`,
  })
  if (nextAction.type !== "open_url") {
    throw new Error(
      `Unexpected connect next action for instagram: ${nextAction.type}`,
    )
  }
  redirect(nextAction.url)
}
