import type { ConversationMemberScope } from "@chatbotx.io/business"
import type {
  WorkspaceApiTokenModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { os } from "@orpc/server"
import type { ResponseHeadersPluginContext } from "@orpc/server/plugins"
import type { SessionUser } from "@/lib/auth/utils"

// Handlers only ever need `.permission`/`.scopes` off the authenticated
// token — never `tokenHash`/`encryptedToken`. Projecting the context type
// down to this shape means a careless `logger.info({ apiToken })` at a
// handler call site can't ship a usable credential hash to logs; the full
// row still exists, but only inside workspace-token-auth.ts before this
// projection is built.
export type RequestApiToken = Pick<
  WorkspaceApiTokenModel,
  "id" | "workspaceId" | "permission" | "scopes" | "isDefault"
>

export type BaseContext = ResponseHeadersPluginContext & {
  headers: Headers
  url?: string
  requestIssuedAtMs?: number
  session?: {
    ipAddress?: string | null
    userAgent?: string | null
  }
  user?: SessionUser
  workspace?: WorkspaceModel
  apiToken?: RequestApiToken
  /**
   * Set only for a mobile JWT principal: the caller's real membership of
   * `workspace`. Its presence is what switches the `/v1` handlers from
   * workspace-level (API token / MCP) behavior to member-scoped behavior —
   * contact/conversation scope, per-user attribution. Never set for workspace
   * API tokens or MCP OAuth, which stay workspace-level and unscoped.
   */
  member?: WorkspaceMemberModel
  /** Mobile member scope resolved once per request, including inbox-team ids. */
  memberConversationScope?: Promise<ConversationMemberScope>
  /** Mobile JWT principal only: the installation the access token was issued to. */
  mobileDeviceId?: string
  /**
   * Stable identity of the workspace or channel API credential that
   * authenticated this request. The public API idempotency middleware scopes
   * keys to it.
   */
  apiCredentialId?: string
}

export const base = os.$context<BaseContext>()
