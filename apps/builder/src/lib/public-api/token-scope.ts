import type { WorkspaceApiTokenScope } from "@chatbotx.io/database/partials"
import { ORPCError } from "@orpc/server"

/**
 * Whether a workspace API token may use any of `required`. `null` scopes mean
 * "All scopes" (see WorkspaceApiToken.scopes); an absent token (session or
 * member caller) is unrestricted here too, matching `requireTokenScope`.
 */
export const tokenHasAnyScope = (
  scopes: WorkspaceApiTokenScope[] | null | undefined,
  required: WorkspaceApiTokenScope[],
): boolean =>
  scopes == null || required.some((candidate) => scopes.includes(candidate))

/**
 * In-handler scope check for an operation that needs a second scope on top of
 * the route's own — e.g. `appointments.createBookingLink` with `send=true`
 * also sends an inbox message. Call it before touching any resource so a
 * token without the scope learns nothing about it.
 */
export const assertTokenScope = (
  context: { apiToken?: { scopes: WorkspaceApiTokenScope[] | null } },
  scope: WorkspaceApiTokenScope,
): void => {
  if (!tokenHasAnyScope(context.apiToken?.scopes, [scope])) {
    throw new ORPCError("FORBIDDEN", {
      message: `Token is not authorized for the '${scope}' scope`,
    })
  }
}
