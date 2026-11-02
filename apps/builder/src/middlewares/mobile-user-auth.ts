import { ORPCError } from "@orpc/server"
import { assertApiNotRateLimited } from "@/lib/rate-limit/api-rate-limit"
import { getGuestClientIp } from "@/lib/rate-limit/guest-rate-limit"
import { base } from "./context"

const JWT_SEGMENT_COUNT = 3
// Same coarse per-IP ceiling the workspace-token middleware applies before it
// touches a token; shares its bucket so both `/v1` stacks count one client once.
const PREAUTH_REQUEST_LIMIT = 600

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
    // Lazy: `@/orpc` imports this file, and the principal resolver pulls in the
    // business barrel; keep that out of every module that merely mounts a route.
    const { authenticateMobileBearer, invalidMobileTokenError, toSessionUser } =
      await import("@/lib/mobile-auth/resolve-mobile-principal")
    const authHeader = context.headers.get("Authorization")
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null
    if (!bearerToken || bearerToken.split(".").length !== JWT_SEGMENT_COUNT) {
      throw invalidMobileTokenError()
    }

    await assertApiNotRateLimited({
      scope: "workspace-token-preauth-rate-limit",
      key: getGuestClientIp(context.headers),
      limit: PREAUTH_REQUEST_LIMIT,
      resHeaders: context.resHeaders,
    })

    const { isMobileAccessTokenCandidate } = await import(
      "@chatbotx.io/auth/mobile-resource"
    )
    if (!isMobileAccessTokenCandidate(bearerToken)) {
      throw invalidMobileTokenError()
    }
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
        requestIssuedAtMs: Date.now(),
        user: toSessionUser(principal.user),
        mobileDeviceId: principal.deviceId ?? undefined,
        apiCredentialId: `mobile:${principal.user.id}:${principal.deviceId ?? "-"}`,
      },
    })
  })

export const mobileUserAuthMiddleware = createMobileUserAuthMiddleware()
export const mobileUserPasswordChangeAuthMiddleware =
  createMobileUserAuthMiddleware({ allowPasswordChangeRequired: true })
