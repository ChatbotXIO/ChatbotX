import {
  MobileTokenVerificationUnavailableError,
  verifyMobileAccessToken,
} from "@chatbotx.io/auth/mobile-resource"
import { userService, workspaceMemberService } from "@chatbotx.io/business"
import { hasContactsAccess } from "@chatbotx.io/business/workspace-member/permissions"
import type { WorkspaceApiTokenScope } from "@chatbotx.io/database/partials"
import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { ORPCError } from "@orpc/server"
import type { SessionUser } from "@/lib/auth/utils"

/**
 * Resource areas a member's mobile JWT may reach, derived from their
 * permissions (never `null` = unrestricted). The areas listed are exactly the
 * ones the allowlisted mobile routes live in; a member with no contacts/inbox
 * access gets none, so every `/v1` route answers 403 for them.
 */
const INBOX_SCOPES: WorkspaceApiTokenScope[] = [
  "contacts",
  "inbox",
  "automation",
  "broadcasts",
  "media",
]

export const deriveMemberScopes = (
  member: Pick<WorkspaceMemberModel, "permissions">,
): WorkspaceApiTokenScope[] =>
  hasContactsAccess(member.permissions) ? INBOX_SCOPES : []

export const WORKSPACE_ID_PATTERN = /^\d{1,20}$/
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n

export const isValidWorkspaceId = (value: string): boolean =>
  WORKSPACE_ID_PATTERN.test(value) && BigInt(value) <= POSTGRES_BIGINT_MAX

export const invalidMobileTokenError = () =>
  new ORPCError("INVALID_CHATBOT_TOKEN", {
    status: 401,
    message: "Invalid or missing access token",
  })

/** The verified-token subject plus the live user row it points at. */
type MobileUserPrincipal = {
  user: UserModel
  deviceId: string | null
}

/**
 * Verifies a mobile access JWT (signature, issuer, audience `<builder>/api`,
 * expiry) and loads the user. Returns null for anything that is not a valid
 * mobile token for an existing user. `mustChangePassword` is read from the
 * database, not the claim, so clearing it takes effect immediately.
 */
export const authenticateMobileBearer = async (
  bearerToken: string,
): Promise<MobileUserPrincipal | null> => {
  const { auth } = await import("@/lib/auth/auth")
  const subject = await verifyMobileAccessToken(auth, bearerToken).catch(
    (error: unknown) => {
      if (error instanceof MobileTokenVerificationUnavailableError) {
        throw new ORPCError("SERVICE_UNAVAILABLE", {
          message: "Token verification is temporarily unavailable",
        })
      }
      throw error
    },
  )
  if (!subject) {
    return null
  }
  const user = await userService.findById(subject.userId)
  if (!user) {
    return null
  }
  return { user, deviceId: subject.deviceId }
}

export const toSessionUser = (user: UserModel): SessionUser => {
  const { tenantId: _tenantId, ...sessionUser } = user
  return sessionUser
}

/**
 * The caller's REAL membership of the workspace named by `x-workspace-id`.
 * A platform-support synthetic membership is deliberately not accepted: the
 * mobile app is an agent surface, never a support session.
 */
export const requireMobileMember = async (props: {
  user: Pick<UserModel, "id">
  requestedWorkspaceId: string | undefined
}): Promise<{ workspace: WorkspaceModel; member: WorkspaceMemberModel }> => {
  const { requestedWorkspaceId } = props
  if (!(requestedWorkspaceId && isValidWorkspaceId(requestedWorkspaceId))) {
    throw new ORPCError("WORKSPACE_SELECTION_REQUIRED", {
      status: 400,
      message: "A numeric x-workspace-id header is required for this request",
    })
  }
  const membership = await workspaceMemberService.findMembership({
    workspaceId: requestedWorkspaceId,
    userId: props.user.id,
  })
  if (!membership?.workspace) {
    throw new ORPCError("FORBIDDEN", {
      message: "Account has no access to this workspace",
    })
  }
  const { workspace, ...member } = membership
  return { workspace, member }
}
