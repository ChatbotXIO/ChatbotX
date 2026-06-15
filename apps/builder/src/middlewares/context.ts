import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { os } from "@orpc/server"
import type { SessionUser } from "@/lib/auth/utils"

export const base = os.$context<{
  headers: Headers
  url?: string
  user?: SessionUser
  workspace?: WorkspaceModel
}>()
