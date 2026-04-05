import { ModelNotfoundException } from "@chatbotx.io/database/errors"
import { ORPCError, onError } from "@orpc/server"
import { ChatbotXException } from "./lib/errors/exception"
import { authMiddleware } from "./middlewares/auth"
import { base } from "./middlewares/context"
import { workspaceTokenAuthMidddleware } from "./middlewares/workspace-token-auth"

export const authorizedAPI = base
  .use(
    onError((error: Error) => {
      if (error.name === ChatbotXException.name) {
        throw new ORPCError((error as ChatbotXException).code, {
          message: error.message,
          status: (error as ChatbotXException).httpStatusCode || 400,
        })
      }

      if (error.name === ModelNotfoundException.name) {
        throw new ORPCError("notFound", {
          message: error.message,
          status: 404,
        })
      }
    }),
  )
  .use(authMiddleware)

export const workspaceTokenAuthAPI = base
  .use(
    onError((error: Error) => {
      if (error.name === ChatbotXException.name) {
        throw new ORPCError((error as ChatbotXException).code, {
          message: error.message,
          status: (error as ChatbotXException).httpStatusCode || 400,
        })
      }

      if (error.name === ModelNotfoundException.name) {
        throw new ORPCError("notFound", {
          message: error.message,
          status: 404,
        })
      }
    }),
  )
  .use(workspaceTokenAuthMidddleware)
