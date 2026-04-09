import { db } from "@chatbotx.io/database/client"
import { ORPCError } from "@orpc/server"
import { base } from "./context"

export const workerAuthMiddleware = base.middleware(
  async ({ context, next }) => {
    const token = context.headers.get("X-API-KEY")
    if (!token) {
      throw new ORPCError("INVALID_API_KEY")
    }

    const workspace = await db.query.workspaceModel.findFirst()
    if (!workspace) {
      throw new ORPCError("INVALID_API_KEY")
    }

    // Adds session and user to the context
    return await next({
      context: {
        workspace,
      },
    })
  },
)
