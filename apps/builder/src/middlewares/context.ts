import type { ChatbotModel, UserModel } from "@aha.chat/database/types"
import { os } from "@orpc/server"

export const base = os.$context<{
  headers: Headers
  user?: UserModel
  chatbot?: ChatbotModel
}>()
