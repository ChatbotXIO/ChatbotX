import { workspaceService } from "@chatbotx.io/business"
import { ORPCError } from "@orpc/server"
import { base } from "./context"

export const workspaceTokenAuthMidddleware = base.middleware(
  async ({ context, next }) => {
    const authHeader = context.headers.get("Authorization")
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null
    const apiKeyToken = context.url
      ? new URL(context.url).searchParams.get("token")
      : null
    const token = bearerToken ?? apiKeyToken
    if (!token) {
      throw new ORPCError("INVALID_CHATBOT_TOKEN")
    }

    const workspace = await workspaceService.find({ where: { token } })
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
