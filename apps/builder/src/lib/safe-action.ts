import { findOrFail, isDatabaseError } from "@aha.chat/database/client"
import { userModel } from "@aha.chat/database/schema"
import type { UserModel } from "@aha.chat/database/types"
import { SdkException } from "@aha.chat/sdk"
import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action"
import { getAllChatbotMembers } from "@/features/chatbot-members/queries"
import { getCurrentUserId } from "@/lib/auth/utils"
import { BaseException } from "./errors/exception"
import { logger } from "./log"

export const actionClient = createSafeActionClient({
  handleServerError(error) {
    if (isDatabaseError(error)) {
      logger.error(error)
      return DEFAULT_SERVER_ERROR_MESSAGE
    }

    if (error instanceof BaseException || error instanceof SdkException) {
      return error.message
    }

    return DEFAULT_SERVER_ERROR_MESSAGE
  },
})

export const authActionClient = actionClient.use(async ({ next }) => {
  const id = await getCurrentUserId()

  const user = await findOrFail<UserModel>(userModel, {
    id,
  })

  return next({ ctx: { user } })
})

export const chatbotActionClient = authActionClient.use(
  async ({ bindArgsClientInputs, ctx, next }) => {
    const { user } = ctx

    const [chatbotId] = bindArgsClientInputs
    if (!chatbotId) {
      throw new Error("Chatbot not found")
    }

    const { chatbots } = await getAllChatbotMembers(user.id)
    const chatbot = chatbots.find((c) => c.id === chatbotId)
    if (!chatbot) {
      throw new Error("Chatbot not found")
    }

    return next({ ctx: { chatbot } })
  },
)
