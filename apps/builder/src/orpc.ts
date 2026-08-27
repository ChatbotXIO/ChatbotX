import {
  ChatbotXException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import { ModelNotfoundException } from "@chatbotx.io/database/errors"
import { SdkException } from "@chatbotx.io/sdk"
import { ORPCError, onError } from "@orpc/server"
import { logger } from "./lib/log"
import { authMiddleware } from "./middlewares/auth"
import { channelApiTokenAuthMidddleware } from "./middlewares/channel-api-token-auth"
import { base } from "./middlewares/context"
import { workspaceTokenAuthMidddleware } from "./middlewares/workspace-token-auth"

const CHANNEL_ERROR_FALLBACK = "The provider rejected the request."

/**
 * Single mapping for every error shape the API surfaces to the client. Channel/
 * provider failures (`SdkException` — e.g. `FacebookAdsException`) reuse the
 * shared `toPublicErrorMessage` helper so the provider's own message (Meta's
 * "(#100) …") reaches the UI instead of a generic 500 — a service must NOT
 * hand-roll its own error wrapping.
 */
function throwMappedError(error: Error): void {
  if (error.name === ChatbotXException.name) {
    throw new ORPCError((error as ChatbotXException).code, {
      message: error.message,
      status: (error as ChatbotXException).httpStatusCode || 400,
    })
  }

  if (error.name === ModelNotfoundException.name) {
    throw new ORPCError("notFound", { message: error.message, status: 404 })
  }

  if (error instanceof SdkException) {
    throw new ORPCError("BAD_REQUEST", {
      message: toPublicErrorMessage(error, CHANNEL_ERROR_FALLBACK),
      status: error.httpStatusCode || 400,
    })
  }
}

export const authorizedAPI = base
  .use(
    onError((error: Error) => {
      logger.error(
        { err: error, cause: JSON.stringify(error.cause) },
        "Error in authorizedAPI",
      )
      throwMappedError(error)
    }),
  )
  .use(authMiddleware)

export const workspaceTokenAuthAPI = base
  .use(onError(throwMappedError))
  .use(workspaceTokenAuthMidddleware)

export const channelApiTokenAPI = base
  .use(onError(throwMappedError))
  .use(channelApiTokenAuthMidddleware)
