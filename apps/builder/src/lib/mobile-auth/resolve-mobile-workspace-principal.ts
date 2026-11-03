import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import type { HTTPMethod } from "@orpc/server"
import { ORPCError } from "@orpc/server"
import type { RequestApiToken } from "@/middlewares/context"
import { isMobileMemberRoute } from "./member-route-allowlist"
import { mobileCredentialId } from "./mobile-credential-id"
import {
  authenticateMobileBearer,
  deriveMemberScopes,
  invalidMobileTokenError,
  requireMobileMember,
} from "./resolve-mobile-principal"

export type MobileWorkspacePrincipal = {
  user: UserModel
  deviceId: string | null
  workspace: WorkspaceModel
  member: WorkspaceMemberModel
  apiToken: RequestApiToken
}

/**
 * The third auth branch of `workspaceTokenAuthMidddleware`: a mobile access JWT
 * acting as a workspace member on a `/v1` route. Fails closed — an unverifiable
 * token is a 401, and a route that has not been reviewed for member scoping
 * (not in `MOBILE_MEMBER_ROUTES`) is a 403 before any workspace data is read.
 */
export const resolveMobileWorkspacePrincipal = async (props: {
  bearerToken: string
  requestedWorkspaceId: string | undefined
  method: HTTPMethod | undefined
  path: string | undefined
}): Promise<MobileWorkspacePrincipal> => {
  const principal = await authenticateMobileBearer(props.bearerToken)
  if (!principal) {
    throw invalidMobileTokenError()
  }
  const { user, deviceId } = principal

  // Same gate as the session middleware: a provisioned temporary password must
  // be replaced (via `POST /v1/me/password`) before any workspace access.
  if (user.mustChangePassword) {
    throw new ORPCError("FORBIDDEN", { message: "Password change required" })
  }
  if (!isMobileMemberRoute(props.method, props.path)) {
    throw new ORPCError("FORBIDDEN", {
      message: "This operation is not available to mobile sessions",
    })
  }

  const { workspace, member } = await requireMobileMember({
    user,
    requestedWorkspaceId: props.requestedWorkspaceId,
  })

  return {
    user,
    deviceId,
    workspace,
    member,
    apiToken: {
      id: mobileCredentialId({ user, deviceId, workspace }),
      workspaceId: workspace.id,
      // Members have no read-only mode; what they may do is bounded by the
      // derived `scopes` and, per route, by member scoping in the handler.
      permission: "full",
      scopes: deriveMemberScopes(member),
      isDefault: false,
    },
  }
}
