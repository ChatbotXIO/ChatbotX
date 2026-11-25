import {
  isWorkspaceScheduledForDeletion,
  resolveWorkspaceAccess,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { withAuditContext } from "@chatbotx.io/business/audit"
import {
  hasWorkspacePermission,
  type PermissionsInput,
  type WorkspacePermissionKey,
} from "@chatbotx.io/business/workspace-member/permissions"
import { ORPCError } from "@orpc/server"
import { auth } from "@/lib/auth/auth"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"
import {
  canOpenWorkspaceOnHost,
  resolveRequestTenantId,
  resolveRequestUserTenancy,
} from "@/lib/tenant/request-tenant"
import { assertWorkspaceOwnerAccessForMethod } from "@/lib/workspace/authorize-workspace-access"
import { base } from "./context"

export const authMiddleware = base.middleware(async ({ context, next }) => {
  const requestIssuedAtMs = Date.now()
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
      requestIssuedAtMs,
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
  async ({ context, next, procedure }, workspaceId: string) => {
    if (!context.user) {
      throw new ORPCError("UNAUTHORIZED")
    }

    const realMembership = await workspaceMemberService.findMembership({
      workspaceId,
      userId: context.user.id,
    })

    const access = await resolveWorkspaceAccess({
      realMember: realMembership,
      workspaceId,
      user: context.user,
    })

    if (!access) {
      throw new ORPCError("UNAUTHORIZED")
    }

    const { workspace } = access

    // 404, not 403: a workspace of another tenant's host must not reveal it exists.
    if (
      !canOpenWorkspaceOnHost({
        workspaceTenantId: workspace.tenantId,
        hostTenantId: await resolveRequestTenantId(),
        userTenancy: await resolveRequestUserTenancy(context.user.id),
        isSupportSession: access.isSupportSession,
      })
    ) {
      throw new ORPCError("NOT_FOUND")
    }

    if (isWorkspaceScheduledForDeletion(workspace)) {
      throw new ORPCError("FORBIDDEN", {
        message: "Workspace deletion scheduled",
      })
    }

    // Owner-quota/trial gate — mirrors workspaceActionClient in safe-action.ts.
    // Reads and deletes stay open (invariant #14).
    await assertWorkspaceOwnerAccessForMethod({
      method: procedure["~orpc"].route.method,
      path: procedure["~orpc"].route.path,
      ownerId: workspace.ownerId,
    })

    return withAuditContext(
      {
        userId: context.user.id,
        workspaceId: workspace.id,
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
            workspace,
            workspaceMember: access.member,
            isSupportSession: access.isSupportSession,
          },
        }),
    )
  },
)

/**
 * Chain after `workspaceAuthorizedMidddleware` on a procedure that serves one
 * member-permission section of the app (the Posts page's `broadcast`, say): a
 * member without that permission gets `FORBIDDEN`, the same answer an API route
 * gives, never Next's `notFound()` (that belongs to pages). The permission is
 * read from the membership the gate already put in the context
 * (`workspaceMember`, support-access sessions included), so the check costs no
 * second lookup.
 *
 * ```ts
 * .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
 * .use(workspacePermissionMiddleware("broadcast"), (input) => input.workspaceId)
 * ```
 */
export const workspacePermissionMiddleware = (key: WorkspacePermissionKey) =>
  base.middleware(async ({ context, next }, workspaceId: string) => {
    if (!context.user) {
      throw new ORPCError("UNAUTHORIZED")
    }
    // The gate before this one already resolved the membership into the
    // context; look it up only when this middleware is used on its own.
    const gated = (
      context as { workspaceMember?: { permissions: PermissionsInput } }
    ).workspaceMember
    const permissions =
      gated?.permissions ??
      (
        await resolveWorkspaceAccess({
          realMember: await workspaceMemberService.findMembership({
            userId: context.user.id,
            workspaceId,
          }),
          user: context.user,
          workspaceId,
        })
      )?.member.permissions
    if (!(permissions && hasWorkspacePermission(permissions, key))) {
      throw new ORPCError("FORBIDDEN", {
        message: "You do not have permission to perform this action",
      })
    }
    return next()
  })
