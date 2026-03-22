import { db } from "@aha.chat/database/client"
import { ORPCError } from "@orpc/server"
import { base } from "./context"

export const chatbotTokenMiddleware = base.middleware(
  async ({ context, next }) => {
    const token = context.headers.get("X-CHATBOT-TOKEN")
    if (!token) {
      throw new ORPCError("INVALID_CHATBOT_TOKEN")
    }

    const chatbot = await db.query.chatbotModel.findFirst({
      where: { token },
    })
    if (!chatbot) {
      throw new ORPCError("INVALID_CHATBOT_TOKEN")
    }

    // Adds session and user to the context
    return await next({
      context: {
        chatbot,
      },
    })
  },
)
