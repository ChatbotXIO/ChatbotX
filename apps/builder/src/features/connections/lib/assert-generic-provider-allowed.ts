import { connectionStateService } from "@chatbotx.io/business"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import {
  connectionProviderDedicatedOnlyException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import type { IntegrationType } from "@chatbotx.io/database/partials"

/**
 * Providers whose connect lifecycle is owned by a dedicated, permission-gated
 * entry point. The generic connections API (private oRPC + public `/v1`) only
 * checks workspace membership / token scope, so it must refuse to mutate these:
 * create, reconnect, rename, refresh, disconnect, and the connect-session
 * targets/cancel endpoints. `verify` and reads stay open.
 *
 * - `googleAds`: super admin only and never a platform support session
 *   (`assertCanManageGoogleAds`). v1 has no public API for Google Ads.
 */
const DEDICATED_ONLY_PROVIDERS: ReadonlySet<IntegrationType> = new Set([
  "googleAds",
] satisfies IntegrationType[])

/** Throws a typed 403 when `provider` may only be managed from its dedicated entry point. */
export const assertGenericProviderAllowed = (
  provider: IntegrationType,
): void => {
  if (DEDICATED_ONLY_PROVIDERS.has(provider)) {
    throw connectionProviderDedicatedOnlyException(provider)
  }
}

/** Resolves the connection (workspace-scoped, 404 if missing) and applies the guard to its provider. */
export const assertConnectionProviderAllowed = async (input: {
  connectionId: string
  workspaceId: string
}): Promise<void> => {
  const connection = await connectionStateService.getForWorkspace({
    id: input.connectionId,
    workspaceId: input.workspaceId,
  })
  if (!connection) {
    throw notFoundException("Connection not found")
  }
  assertGenericProviderAllowed(connection.provider)
}

/** Resolves the connect session (workspace-scoped, 404 if missing) and applies the guard to its provider. */
export const assertSessionProviderAllowed = async (input: {
  sessionId: string
  workspaceId: string
}): Promise<void> => {
  const session = await connectSessionService.findByIdForWorkspace({
    id: input.sessionId,
    workspaceId: input.workspaceId,
  })
  if (!session) {
    throw notFoundException("Connect session not found")
  }
  assertGenericProviderAllowed(session.provider)
}
