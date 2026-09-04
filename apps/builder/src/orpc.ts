import {
  ChatbotXException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import { ModelNotfoundException } from "@chatbotx.io/database/errors"
import type { WorkspaceApiTokenScope } from "@chatbotx.io/database/partials"
import { SdkException } from "@chatbotx.io/sdk"
import { ORPCError, onError } from "@orpc/server"
import { ActionValidationError } from "next-safe-action"
import { logger } from "./lib/log"
import { authMiddleware } from "./middlewares/auth"
import { channelApiTokenAuthMidddleware } from "./middlewares/channel-api-token-auth"
import { base } from "./middlewares/context"
import { workspaceTokenAuthMidddleware } from "./middlewares/workspace-token-auth"

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
      status: error.httpStatusCode ?? 400,
    })
  }

  if (error instanceof ModelNotfoundException) {
    return new ORPCError("notFound", { message: error.message, status: 404 })
  }

  if (error instanceof SdkException) {
    return new ORPCError("BAD_REQUEST", {
      message: toPublicErrorMessage(error, CHANNEL_ERROR_FALLBACK),
      status: error.httpStatusCode ?? 400,
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
 * `onError` interceptor shared by all three auth stacks below. A known error
 * is warn-logged and remapped to its client-facing `ORPCError`; anything
 * else is left alone (not logged here) so it falls through to the route
 * handler's `logUnexpectedOrpcErrorCallback` interceptor, which is the single place
 * unknown errors get logged at error level.
 */
export function mapKnownOrpcErrors(error: unknown) {
  const mapped = toKnownOrpcError(error)
  if (mapped) {
    // Expected client-facing 4xx — keep it out of error-level alerting.
    logger.warn({ err: error }, "oRPC handler rejected request")
    throw mapped
  }
}

const withErrorMapping = base.use(onError(mapKnownOrpcErrors))

export const authorizedAPI = withErrorMapping.use(authMiddleware)

/**
 * Enforces the resource-area axis on top of `workspaceTokenAuthMidddleware`.
 * `apiToken.scopes === null` means unrestricted ("All scopes") — every
 * existing and system-default token — so it always passes. A non-null array
 * is an explicit allow-list denied for anything outside it, including a
 * scope that ships after the token was created (least privilege; see the
 * WorkspaceApiToken.scopes doc).
 */
const requireTokenScope = (scope: WorkspaceApiTokenScope) =>
  base.middleware(async ({ context, next }) => {
    // apiToken is always set here in practice — this middleware is only ever
    // chained after workspaceTokenAuthMidddleware via
    // workspaceTokenAuthAPIForScope below — but the base context type marks
    // it optional (shared with authorizedAPI, which never sets it).
    const scopes = context.apiToken?.scopes
    if (scopes !== null && scopes !== undefined && !scopes.includes(scope)) {
      throw new ORPCError("FORBIDDEN", {
        message: `Token is not authorized for the '${scope}' scope`,
      })
    }
    return await next()
  })

/**
 * Every workspace-token endpoint must declare its resource scope — there is
 * no unscoped variant. This is deliberate: removing a bare
 * `workspaceTokenAuthAPI` export makes every current and future endpoint
 * fail to compile until it picks a scope, turning the compile error itself
 * into the router-sweep checklist.
 */
export const workspaceTokenAuthAPIForScope = (scope: WorkspaceApiTokenScope) =>
  withErrorMapping
    .use(workspaceTokenAuthMidddleware)
    .use(requireTokenScope(scope))

export const channelApiTokenAPI = withErrorMapping.use(
  channelApiTokenAuthMidddleware,
)
