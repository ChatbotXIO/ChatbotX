import {
  isWorkspaceScheduledForDeletion,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { withAuditContext } from "@chatbotx.io/business/audit"
import { ORPCError } from "@orpc/server"
import { auth } from "@/lib/auth/auth"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"
import { base } from "./context"

export const authMiddleware = base.middleware(async ({ context, next }) => {
  const sessionData = await auth.api.getSession({
    headers: context.headers,
  })

  if (!(sessionData?.session && sessionData?.user)) {
    throw new ORPCError("UNAUTHORIZED")
  }

  // Forced-password-change gate for the whole oRPC surface. A reseller-
  // provisioned user holding a temporary password is redirected to
  // /auth/change-password by the RSC layouts, but a stale session could still
  // call an RPC/OpenAPI handler directly. Mirrors the server-action gate in
  // `safe-action.ts`. The change-password flow uses better-auth + a server
  // action (not oRPC), so nothing here needs to stay callable while flagged.
  if (sessionData.user.mustChangePassword) {
    throw new ORPCError("FORBIDDEN", { message: "Password change required" })
  }

  // Adds session and user to the context
  return next({
    context: {
      session: sessionData.session,
      user: {
        ...sessionData.user,
        image: sessionData.user.image || null,
        isAnonymous: sessionData.user.isAnonymous ?? false,
        mustChangePassword: sessionData.user.mustChangePassword ?? false,
        // stripeCustomerId: sessionData.user.stripeCustomerId || null,
      },
    },
  })
})

export const workspaceAuthorizedMidddleware = base.middleware(
  async ({ context, next }, workspaceId: string) => {
    if (!context.user) {
      throw new ORPCError("UNAUTHORIZED")
    }

    const workspaceMember = await workspaceMemberService.findMembership({
      workspaceId,
      userId: context.user.id,
    })

    if (!workspaceMember) {
      throw new ORPCError("UNAUTHORIZED")
    }

    if (isWorkspaceScheduledForDeletion(workspaceMember.workspace)) {
      throw new ORPCError("FORBIDDEN", {
        message: "Workspace deletion scheduled",
      })
    }

    return withAuditContext(
      {
        userId: context.user.id,
        workspaceId: workspaceMember.workspace.id,
        ipAddress:
          context.session?.ipAddress ?? getGuestClientIp(context.headers),
        userAgent:
          context.session?.userAgent ??
          context.headers.get("user-agent") ??
          undefined,
      },
      () =>
        next({
          context: {
            workspace: workspaceMember.workspace,
          },
        }),
    )
  },
)
