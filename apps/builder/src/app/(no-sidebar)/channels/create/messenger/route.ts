import {
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import type { NextRequest } from "next/server"
import {
  buildMessengerReferer,
  generateMessengerRedirectUri,
} from "@/features/integration-messenger/libs/oauth"
import { tryReuseFacebookSsoToken } from "@/features/integration-messenger/libs/sso-reuse"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserId } from "@/lib/auth/utils"
import {
  encryptAuth,
  FB_MESSENGER_PENDING_AUTH_COOKIE,
  FB_PENDING_AUTH_MAX_AGE,
} from "@/lib/facebook-pending-auth"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"

/**
 * Reached only via a redirect from `/channels/create?channel=messenger`
 * (never linked to directly). The Facebook SSO token reuse check needs to set
 * the pending-auth cookie on a hit, and cookies can only be written from a
 * Server Action or a Route Handler — never from a Server Component's render,
 * which is what `/channels/create` is. This route re-runs the auth/workspace
 * guards itself since it's a public GET endpoint, not just an internal helper.
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

  const reuse = await tryReuseFacebookSsoToken({
    userId,
    messengerCredential: messenger.config,
  })

  if (reuse.reusable) {
    // Mirror the OAuth callback's workspace resolution (`callback.ts`): a
    // channel connect can be the very first one for a user, with no
    // workspace yet — create it now instead of writing a pending-auth cookie
    // that points nowhere.
    const targetWorkspace = workspaceId
      ? await workspaceService.findById({ id: workspaceId })
      : await workspaceService.create({
          data: { name: "New Workspace", ownerId: userId },
          createdBy: userId,
        })
    const referer = await buildMessengerReferer(targetWorkspace.id)
    const token = await encryptAuth({
      userToken: reuse.userToken,
      userId: reuse.userId,
      userName: reuse.userName,
      userAvatarUrl: reuse.userAvatarUrl,
      workspaceId: targetWorkspace.id,
      referer,
      version: messenger.config.version,
      expiresAt: Date.now() + FB_PENDING_AUTH_MAX_AGE * 1000,
    })
    const cookieStore = await cookies()
    cookieStore.set(FB_MESSENGER_PENDING_AUTH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: FB_PENDING_AUTH_MAX_AGE,
      path: "/channels/messenger/select",
    })
    redirect("/channels/messenger/select")
  }

  const redirectUri = await generateMessengerRedirectUri(
    messenger.publicConfig,
    workspaceId,
  )
  redirect(redirectUri)
}
