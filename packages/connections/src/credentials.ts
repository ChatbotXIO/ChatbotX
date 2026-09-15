import { isActiveConnectionStatus } from "@chatbotx.io/business/connection"
import {
  connectionAlreadyConnectedException,
  connectionCredentialsRejectedException,
  connectionNotConfiguredException,
  connectionWrongStrategyException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import type {
  ConnectionModel,
  ConnectSessionModel,
} from "@chatbotx.io/database/types"
import type {
  AuthValue,
  ConnectionCredential,
  ConnectNextAction,
} from "@chatbotx.io/sdk"
import { startSession } from "./connect-session-flow"
import {
  findOrThrow,
  parseConfig,
  resolveAdapter,
  resolveOwnerId,
  subscribeWebhookBestEffort,
  upsertConnectionRow,
} from "./internal"

/**
 * `token`/`api_key`/`self_serve` connect: validates `config` against the
 * provider's `configFields`, live-validates it via `fromCredentials`, then
 * creates (or revives a previously disconnected) `Connection` row plus its
 * satellite table row in one transaction. Today every credential-strategy
 * provider is `kind: "integration"` (a workspace singleton, no quota
 * edge), but the transition still runs through `connectionStateService`
 * — not a hardcoded `status: "connected"` insert — so a future `kind:
 * "channel"` credential-strategy provider consumes quota correctly too.
 */
export const connectFromCredentials = async (input: {
  workspaceId: string
  provider: IntegrationType
  config: Record<string, unknown>
  actorUserId?: string | null
  /**
   * Allows replacing an already-`connected`/`degraded` connection's auth
   * and config in place instead of throwing `connectionAlreadyConnected`
   * — only for backward-compat upsert aliases (the legacy `PUT
   * /v1/integrations/ai/{provider}` route, which has always replaced the
   * stored API key/config on repeat calls). The new `POST /v1/connections`
   * surface must NOT set this — a fresh connect should reject an existing
   * active connection.
   */
  allowUpdate?: boolean
}): Promise<ConnectionModel> => {
  const adapter = resolveAdapter(input.provider)
  const { provider } = adapter
  const isCredentialStrategy =
    provider.strategy === "token" ||
    provider.strategy === "api_key" ||
    provider.strategy === "self_serve"
  if (!(isCredentialStrategy && provider.fromCredentials)) {
    throw connectionWrongStrategyException(input.provider)
  }
  if (!adapter.store) {
    throw connectionNotConfiguredException(input.provider)
  }
  const store = adapter.store

  const parsedConfig = parseConfig(provider.configFields, input.config)
  // Fields the caller sent that aren't part of the provider's own
  // credential shape (`configFields`) — e.g. an AI provider's `model`/
  // `temperature`/`maxOutputTokens` — flow straight through to the
  // satellite row's extra columns via `store.insertRow`'s `config`,
  // unvalidated (the satellite table's own NOT NULL/type constraints are
  // the validation for those).
  const configFieldNames = new Set(
    provider.configFields.map((field) => field.name),
  )
  const extraConfig = Object.fromEntries(
    Object.entries(input.config).filter(([key]) => !configFieldNames.has(key)),
  )

  let auth: AuthValue
  try {
    auth = await provider.fromCredentials(parsedConfig)
  } catch (err) {
    throw connectionCredentialsRejectedException(
      toPublicErrorMessage(err, "The provided credentials were rejected."),
    )
  }

  const descriptor = provider.describe(auth)

  const existing = await connectionRepository.findByProviderSourceId({
    workspaceId: input.workspaceId,
    provider: input.provider,
    sourceId: descriptor.sourceId,
  })
  if (
    existing &&
    isActiveConnectionStatus(existing.status) &&
    !input.allowUpdate
  ) {
    throw connectionAlreadyConnectedException()
  }

  const ownerId = await resolveOwnerId({
    kind: provider.kind,
    workspaceId: input.workspaceId,
  })

  const connection = await db.transaction(
    async (tx) =>
      await upsertConnectionRow({
        tx,
        workspaceId: input.workspaceId,
        provider: input.provider,
        kind: provider.kind,
        descriptor,
        auth,
        extraConfig,
        existing,
        store,
        ownerId,
        actorUserId: input.actorUserId,
      }),
  )

  return await subscribeWebhookBestEffort({
    adapter,
    auth,
    connection,
    ownerId,
  })
}

/**
 * Re-authorizes an existing (typically `needs_reauth`) `Connection` — a
 * `startSession` with `purpose: "reconnect"` and `targetConnectionId` set,
 * so `completeAuthorization` skips candidate selection entirely and
 * verifies the re-granted account's identity matches this exact
 * connection instead.
 */
export const reconnect = async (input: {
  connectionId: string
  workspaceId: string
  credential: ConnectionCredential
  callbackUrl: string
  actorUserId?: string | null
  actorTokenId?: string | null
  platformOwnerId?: string | null
  originHost?: string | null
  returnUrl?: string | null
}): Promise<{
  session: ConnectSessionModel
  nextAction: ConnectNextAction
}> => {
  const connection = await findOrThrow({
    connectionId: input.connectionId,
    workspaceId: input.workspaceId,
  })
  return await startSession({
    workspaceId: input.workspaceId,
    provider: connection.provider,
    purpose: "reconnect",
    credential: input.credential,
    callbackUrl: input.callbackUrl,
    targetConnectionId: connection.id,
    actorUserId: input.actorUserId,
    actorTokenId: input.actorTokenId,
    platformOwnerId: input.platformOwnerId,
    originHost: input.originHost,
    returnUrl: input.returnUrl,
  })
}
