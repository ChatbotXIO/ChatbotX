import { db } from "@chatbotx.io/database/client"
import { ORPCError } from "@orpc/server"
import { base } from "./context"

export const workspaceTokenAuthMidddleware = base.middleware(
  async ({ context, next }) => {
    const token = context.headers.get("X-CHATBOT-TOKEN")
    if (!token) {
      throw new ORPCError("INVALID_CHATBOT_TOKEN")
    }

    const workspace = await db.query.workspaceModel.findFirst({
      where: { token },
    })
    if (!workspace) {
      throw new ORPCError("INVALID_CHATBOT_TOKEN")
    }

    // Adds session and user to the context
    return await next({
      context: {
        workspace,
      },
    })
  },
)
