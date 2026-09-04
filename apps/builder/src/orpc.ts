import {
  ChatbotXException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import { ModelNotfoundException } from "@chatbotx.io/database/errors"
import type { WorkspaceApiTokenScope } from "@chatbotx.io/database/partials"
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
  base
    .use(onError(throwMappedError))
    .use(workspaceTokenAuthMidddleware)
    .use(requireTokenScope(scope))

export const channelApiTokenAPI = base
  .use(onError(throwMappedError))
  .use(channelApiTokenAuthMidddleware)
