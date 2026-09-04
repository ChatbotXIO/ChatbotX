import type {
  WorkspaceApiTokenModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { os } from "@orpc/server"
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

export const base = os.$context<{
  headers: Headers
  url?: string
  session?: {
    ipAddress?: string | null
    userAgent?: string | null
  }
  user?: SessionUser
  workspace?: WorkspaceModel
  apiToken?: RequestApiToken
}>()
