import { isMobileAccessTokenCandidate } from "@chatbotx.io/auth/mobile-resource-candidate"
import { ORPCError } from "@orpc/server"
import { mobileCredentialId } from "@/lib/mobile-auth/mobile-credential-id"
import {
  authenticateMobileBearer,
  invalidMobileTokenError,
  toSessionUser,
} from "@/lib/mobile-auth/resolve-mobile-principal"
import { assertApiNotRateLimited } from "@/lib/rate-limit/api-rate-limit"
import { base } from "./context"
import {
  assertPreAuthNotRateLimited,
  extractBearer,
} from "./workspace-token-auth"

type MobileUserAuthOptions = {
  /**
   * Let a user whose `mustChangePassword` flag is set through. Only the
   * identity read and the password change itself pass it; everything else is
   * refused until the provisioned temporary password has been replaced.
   */
  allowPasswordChangeRequired?: boolean
}

/**
 * Auth for the user-level `/v1/me` surface: a mobile access JWT acting as
 * itself, with no workspace involved (so no `x-workspace-id`). Workspace API
 * tokens and MCP OAuth tokens are rejected: these operations belong to a
 * person's own account, which no integration credential may act for.
 */
export const createMobileUserAuthMiddleware = (
  options: MobileUserAuthOptions = {},
) =>
  base.middleware(async ({ context, next }) => {
    const bearerToken = extractBearer(context.headers)
    if (!(bearerToken && isMobileAccessTokenCandidate(bearerToken))) {
      throw invalidMobileTokenError()
    }

    await assertPreAuthNotRateLimited(context.headers, context.resHeaders)
    const principal = await authenticateMobileBearer(bearerToken)
    if (!principal) {
      throw invalidMobileTokenError()
    }

    await assertApiNotRateLimited({
      scope: "mobile-user-rate-limit",
      key: principal.user.id,
      resHeaders: context.resHeaders,
    })

    if (
      principal.user.mustChangePassword &&
      !options.allowPasswordChangeRequired
    ) {
      throw new ORPCError("FORBIDDEN", { message: "Password change required" })
    }

    return await next({
      context: {
        user: toSessionUser(principal.user),
        mobileDeviceId: principal.deviceId ?? undefined,
        apiCredentialId: mobileCredentialId(principal),
      },
    })
  })

export const mobileUserAuthMiddleware = createMobileUserAuthMiddleware()
export const mobileUserPasswordChangeAuthMiddleware =
  createMobileUserAuthMiddleware({ allowPasswordChangeRequired: true })
