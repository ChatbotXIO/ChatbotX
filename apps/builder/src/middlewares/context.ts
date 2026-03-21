import type { ChatbotModel, UserModel } from "@chatbotx.io/database/types"
import { os } from "@orpc/server"

export const base = os.$context<{
  headers: Headers
  user?: UserModel
  chatbot?: ChatbotModel
}>()
