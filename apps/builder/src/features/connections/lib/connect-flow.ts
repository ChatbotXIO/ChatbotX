import {
  channelHiddenException,
  connectionNotConfiguredException,
} from "@chatbotx.io/business/errors"
import {
  CONNECTION_REGISTRY,
  connectionService,
} from "@chatbotx.io/connections"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import type {
  ConnectionModel,
  ConnectSessionModel,
} from "@chatbotx.io/database/types"
import type { ConnectionStrategy } from "@chatbotx.io/sdk"
import { sanitizeOptionalReturnUrl } from "@/lib/oauth-referer"
import { resolveChannelPolicy } from "@/lib/workspace/resolve-visible-channels"
import { resolveOAuthCredential } from "./resolve-connect-credential"
import { channelForProvider } from "./resolve-provider"

/** A connect/reconnect always runs as either a builder-session user or a workspace-token caller — never both, never neither. */
export type ConnectFlowActor =
  | { actorUserId: string; actorTokenId?: never }
  | { actorTokenId: string; actorUserId?: never }

export const isCredentialStrategy = (strategy: ConnectionStrategy): boolean =>
  strategy === "token" || strategy === "api_key" || strategy === "self_serve"

/**
 * Throws `channelHiddenException` when `provider` is a channel this
 * workspace's tenant policy does not allow creating — gates purely on
 * `policy.visibleChannels`, which already grandfathers an existing connected
 * channel in via `inboxService.distinctConnectedChannels` (see
 * `resolveChannelPolicy`), so this never needs its own "already connected"
 * query on top. A no-op for a non-channel provider or a workspace with no
 * tenant policy.
 */
export const assertChannelCreatable = async (
  workspaceId: string,
  provider: IntegrationType,
): Promise<void> => {
  const channel = channelForProvider(provider)
  if (!channel) {
    return
  }
  const policy = await resolveChannelPolicy(workspaceId)
  if (policy && !policy.visibleChannels.includes(channel)) {
    throw channelHiddenException(channel)
  }
}

/**
 * `POST /v1/connections`'s shared implementation — the public and private
 * routers each resolve their own `ownerId`/`actor` (tenant-aware platform
 * owner, builder-user vs. workspace-token identity) and call this once, so
 * neither duplicates the hidden-channel check, the strategy branch, or the
 * OAuth-credential/session-start calls.
 */
export const startConnect = async (input: {
  workspaceId: string
  provider: IntegrationType
  config: Record<string, unknown> | undefined
  redirectUrl: string | undefined
  ownerId: string
  actor: ConnectFlowActor
}): Promise<{
  connection: ConnectionModel | null
  session: ConnectSessionModel | null
}> => {
  const adapter = CONNECTION_REGISTRY[input.provider]
  if (!adapter) {
    throw connectionNotConfiguredException(input.provider)
  }

  await assertChannelCreatable(input.workspaceId, input.provider)

  if (isCredentialStrategy(adapter.provider.strategy)) {
    const connection = await connectionService.connectFromCredentials({
      workspaceId: input.workspaceId,
      provider: input.provider,
      config: input.config ?? {},
      actorUserId: input.actor.actorUserId,
    })
    return { connection, session: null }
  }

  const resolved = await resolveOAuthCredential({
    provider: input.provider,
    ownerId: input.ownerId,
  })
  if (!resolved) {
    throw connectionNotConfiguredException(input.provider)
  }
  const returnUrl = await sanitizeOptionalReturnUrl(input.redirectUrl)
  const { session } = await connectionService.startSession({
    workspaceId: input.workspaceId,
    provider: input.provider,
    purpose: "connect",
    credential: resolved.credential,
    callbackUrl: resolved.callbackUrl,
    platformOwnerId: input.ownerId,
    returnUrl,
    ...input.actor,
  })
  return { connection: null, session }
}

/** `POST /v1/connections/{id}/reconnect`'s shared implementation — see `startConnect`. */
export const startReconnect = async (input: {
  connection: ConnectionModel
  workspaceId: string
  redirectUrl: string | undefined
  ownerId: string
  actor: ConnectFlowActor
}): Promise<{ session: ConnectSessionModel }> => {
  const resolved = await resolveOAuthCredential({
    provider: input.connection.provider,
    ownerId: input.ownerId,
  })
  if (!resolved) {
    throw connectionNotConfiguredException(input.connection.provider)
  }
  const returnUrl = await sanitizeOptionalReturnUrl(input.redirectUrl)
  const { session } = await connectionService.reconnect({
    connectionId: input.connection.id,
    workspaceId: input.workspaceId,
    credential: resolved.credential,
    callbackUrl: resolved.callbackUrl,
    platformOwnerId: input.ownerId,
    returnUrl,
    ...input.actor,
  })
  return { session }
}
