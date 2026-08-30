import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { os } from "@orpc/server"
import type { SessionUser } from "@/lib/auth/utils"

export type BaseContext = {
  headers: Headers
  url?: string
  session?: {
    ipAddress?: string | null
    userAgent?: string | null
  }
  user?: SessionUser
  workspace?: WorkspaceModel
}

export const base = os.$context<BaseContext>()
