import type { UserModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { os } from "@orpc/server"

export const base = os.$context<{
  headers: Headers
  url?: string
  user?: UserModel
  workspace?: WorkspaceModel
}>()
