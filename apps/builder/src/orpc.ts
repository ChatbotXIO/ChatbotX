import {
  ChatbotXException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import { ModelNotfoundException } from "@chatbotx.io/database/errors"
import { SdkException } from "@chatbotx.io/sdk"
import { ORPCError, onError } from "@orpc/server"
import { ActionValidationError } from "next-safe-action"
import { logger } from "./lib/log"
import { authMiddleware } from "./middlewares/auth"
import { channelApiTokenAuthMidddleware } from "./middlewares/channel-api-token-auth"
import { base } from "./middlewares/context"
import { workspaceTokenAuthMidddleware } from "./middlewares/workspace-token-auth"

export type { BaseContext } from "./middlewares/context"

const CHANNEL_ERROR_FALLBACK = "The provider rejected the request."

/**
 * Translates domain errors thrown below a handler into the ORPCError the
 * client expects, or returns `undefined` when the error is not one we know.
 * `instanceof` (not `error.name`) so subclasses such as
 * `SlotUnavailableException` are mapped too. Channel/provider failures
 * (`SdkException` — e.g. `FacebookAdsException`) reuse the shared
 * `toPublicErrorMessage` helper so the provider's own message (Meta's
 * "(#100) …") reaches the UI instead of a generic 500 — a service must NOT
 * hand-roll its own error wrapping.
 */
function toKnownOrpcError(
  error: unknown,
): ORPCError<string, unknown> | undefined {
  if (error instanceof ChatbotXException) {
    return new ORPCError(error.code, {
      message: error.message,
      status: error.httpStatusCode || 400,
    })
  }

  if (error instanceof ModelNotfoundException) {
    return new ORPCError("notFound", { message: error.message, status: 404 })
  }

  if (error instanceof SdkException) {
    return new ORPCError("BAD_REQUEST", {
      message: toPublicErrorMessage(error, CHANNEL_ERROR_FALLBACK),
      status: error.httpStatusCode || 400,
    })
  }

  // A shared action helper called `returnValidationErrors` — a 4xx, not a
  // crash. Temporary until every handler calls the service directly.
  if (error instanceof ActionValidationError) {
    return new ORPCError("invalidRequestData", {
      message: error.message,
      status: 422,
      data: error.validationErrors,
    })
  }

  return
}

/**
 * Shared with `packages/api-contract`-based implementations: a contract
 * router is implemented via
 * `implement(contract).$context<BaseContext>().use(onError(logAndMapKnownOrpcErrors)).use(workspaceTokenAuthMidddleware)`
 * (from `@/middlewares/workspace-token-auth`) so its wire-level behavior
 * (error shapes, workspace-token auth) never drifts from
 * `workspaceTokenAuthAPI`. Exported as a plain function (not a pre-composed
 * builder) because `implement()` needs the concrete contract object at the
 * `.use()` call site — threading it through a generic helper defeats oRPC's
 * per-procedure type inference (`AnyContractRouter`'s procedure-or-router
 * union makes `.use()`'s overloads unresolvable against a still-generic type
 * parameter).
 */
export function logAndMapKnownOrpcErrors(error: unknown) {
  const mapped = toKnownOrpcError(error)
  if (mapped) {
    // Expected client-facing 4xx — keep it out of error-level alerting.
    logger.warn({ err: error }, "oRPC handler rejected request")
    throw mapped
  }

  logger.error(
    {
      err: error,
      cause: JSON.stringify(error instanceof Error ? error.cause : undefined),
    },
    "Error in oRPC handler",
  )
}

const withErrorMapping = base.use(onError(logAndMapKnownOrpcErrors))

export const authorizedAPI = withErrorMapping.use(authMiddleware)

export const workspaceTokenAuthAPI = withErrorMapping.use(
  workspaceTokenAuthMidddleware,
)

export const channelApiTokenAPI = withErrorMapping.use(
  channelApiTokenAuthMidddleware,
)
