import { isActiveConnectionStatus } from "@chatbotx.io/business/connection"
import {
  connectionAlreadyConnectedException,
  connectionCredentialsRejectedException,
  connectionNotConfiguredException,
  connectionProviderUnavailableException,
  connectionWrongStrategyException,
  toPublicErrorMessage,
  validationException,
} from "@chatbotx.io/business/errors"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import type {
  ConnectionModel,
  ConnectSessionModel,
} from "@chatbotx.io/database/types"
import type {
  ConnectionCredential,
  ConnectSessionNextAction,
} from "@chatbotx.io/sdk"
import { startSession } from "./connect-session-flow"
import {
  connectAndPersist,
  findOrThrow,
  isCredentialStrategy,
  parseConfig,
  providerFailureStatus,
  resolveAdapter,
  resolveOwnerId,
  toConnectionProviderError,
} from "./internal"
import { logger } from "./logger"

/**
 * `token`/`api_key`/`self_serve` connect: validates `config` against the
 * provider's `configFields`, live-validates it via `fromCredentials`, then
 * creates (or revives a previously disconnected) `Connection` row plus its
 * satellite table row in one transaction. Credential providers span both
 * `integration` and `channel` kinds; the transition always runs through
 * `connectionStateService` so channel quota edges are applied correctly.
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
  if (!(isCredentialStrategy(provider.strategy) && provider.fromCredentials)) {
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
  // The binding's own allow-list of extra satellite columns a `config`
  // request may set (e.g. an AI provider's `model`/`temperature`, or
  // `openaiCompatible`'s `baseURL`). Computed before `extraConfig` below —
  // a `configFields` entry (consumed by `fromCredentials` for live
  // validation) can ALSO double as a required satellite column
  // (`openaiCompatible`'s `baseURL` is both validated and NOT NULL on
  // `IntegrationOpenaiCompatible`); without this allow-list check, such a
  // field would be unconditionally excluded below and silently dropped
  // before ever reaching `store.insertRow`.
  const allowedConfigColumns = new Set(store.configColumns ?? [])
  const extraConfig = Object.fromEntries(
    Object.entries(input.config).filter(
      ([key]) => !configFieldNames.has(key) || allowedConfigColumns.has(key),
    ),
  )
  // Anything left is not part of the provider's own validated credential
  // shape — only pass it to the satellite insert if the binding's
  // `configColumns` allow-list explicitly names it (e.g. an AI provider's
  // `model`/`temperature`). Otherwise a client could set an arbitrary
  // satellite column (workspaceId, inboxId, tokenHash, …) via `config`.
  const rejectedConfigKeys = Object.keys(extraConfig).filter(
    (key) => !allowedConfigColumns.has(key),
  )
  if (rejectedConfigKeys.length > 0) {
    throw validationException(
      rejectedConfigKeys[0] as string,
      `Unsupported config field(s) for ${input.provider}: ${rejectedConfigKeys.join(", ")}`,
    )
  }

  const [auth, ownerId] = await Promise.all([
    provider.fromCredentials(parsedConfig).catch((err) => {
      const providerError = toConnectionProviderError(err)
      const retryStatus = providerFailureStatus(providerError)
      logger.warn(
        {
          err: providerError,
          provider: input.provider,
          workspaceId: input.workspaceId,
        },
        "connection credentials: provider validation failed",
      )
      if (retryStatus) {
        throw connectionProviderUnavailableException(retryStatus)
      }
      throw connectionCredentialsRejectedException(
        toPublicErrorMessage(
          providerError,
          "The provided credentials were rejected.",
        ),
      )
    }),
    resolveOwnerId({
      kind: provider.kind,
      workspaceId: input.workspaceId,
    }),
  ])
  if ("baseURL" in auth && typeof auth.baseURL === "string") {
    extraConfig.baseURL = auth.baseURL
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
  return await connectAndPersist({
    adapter,
    provider: input.provider,
    workspaceId: input.workspaceId,
    auth,
    descriptor,
    extraConfig,
    existing,
    ownerId,
    actorUserId: input.actorUserId,
    reuseExistingInboxId: true,
    missingOwnerError: new Error(
      "Channel connection requires a workspace owner",
    ),
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
  nextAction: ConnectSessionNextAction
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
