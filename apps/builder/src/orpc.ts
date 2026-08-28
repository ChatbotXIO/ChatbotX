import { ChatbotXException } from "@chatbotx.io/business/errors"
import { ModelNotfoundException } from "@chatbotx.io/database/errors"
import { ORPCError, onError } from "@orpc/server"
import { logger } from "./lib/log"
import { authMiddleware } from "./middlewares/auth"
import { channelApiTokenAuthMidddleware } from "./middlewares/channel-api-token-auth"
import { base } from "./middlewares/context"
import { workspaceTokenAuthMidddleware } from "./middlewares/workspace-token-auth"

function mapKnownOrpcErrors(error: unknown) {
  if (!(error instanceof Error)) {
    return
  }

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
}

function logAndMapKnownOrpcErrors(error: unknown) {
  logger.error(
    {
      err: error,
      cause: JSON.stringify(error instanceof Error ? error.cause : undefined),
    },
    "Error in oRPC handler",
  )
  mapKnownOrpcErrors(error)
}

export const authorizedAPI = base
  .use(onError(logAndMapKnownOrpcErrors))
  .use(authMiddleware)

export const workspaceTokenAuthAPI = base
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

export const channelApiTokenAPI = base
  .use(onError(logAndMapKnownOrpcErrors))
  .use(channelApiTokenAuthMidddleware)
