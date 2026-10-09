import {
  channelHiddenException,
  connectionNotConfiguredException,
  connectionNotOAuthException,
} from "@chatbotx.io/business/errors"
import {
  CONNECTION_REGISTRY,
  connectionService,
  isCredentialStrategy,
  toChannelType,
} from "@chatbotx.io/connections"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import type {
  ConnectionModel,
  ConnectSessionModel,
} from "@chatbotx.io/database/types"
import { sanitizeOptionalReturnUrl } from "@/lib/oauth-referer"
import { resolveChannelPolicy } from "@/lib/workspace/resolve-visible-channels"
import { resolveOAuthCredential } from "./resolve-connect-credential"

/**
 * The allow-listed absolute `redirectUrl` as the application-relative path the
 * connect-session store accepts (`validateReturnUrl` rejects an absolute URL).
 * The origin was already checked by `sanitizeOptionalReturnUrl`; its host is
 * returned as `originHost` so the OAuth callback (which may land on the broker
 * host) redirects back to the host the caller started on, re-checking the
 * allow-list at redirect time.
 */
const toSessionReturn = async (
  redirectUrl: string | undefined,
): Promise<{ returnUrl?: string; originHost?: string }> => {
  const allowed = await sanitizeOptionalReturnUrl(redirectUrl)
  if (!allowed) {
    return {}
  }
  const url = new URL(allowed)
  return {
    returnUrl: `${url.pathname}${url.search}${url.hash}`,
    originHost: url.host,
  }
}

/** A connect/reconnect always runs as either a builder-session user or a workspace-token caller — never both, never neither. */
type ConnectFlowActor =
  | { actorUserId: string; actorTokenId?: never }
  | { actorTokenId: string; actorUserId?: never }

/**
 * Throws `channelHiddenException` when `provider` is a channel this
 * workspace's tenant policy does not allow creating — gates purely on
 * `policy.visibleChannels`, which already grandfathers an existing connected
 * channel in via `inboxService.distinctConnectedChannels` (see
 * `resolveChannelPolicy`), so this never needs its own "already connected"
 * query on top. A no-op for a non-channel provider or a workspace with no
 * tenant policy.
 */
const assertChannelCreatable = async (
  workspaceId: string,
  provider: IntegrationType,
): Promise<void> => {
  if (CONNECTION_REGISTRY[provider]?.provider.kind !== "channel") {
    return
  }
  const channel = toChannelType(provider)
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

  // `facebookAds` reconnects/connects by riding Messenger's existing OAuth
  // grant — it only ever completes through the legacy case in
  // `apps/builder/src/app/integrations/[...integration]/callback.ts`
  // ("Facebook Ads OAuth is routed through this same Messenger callback"),
  // never through this flow's own `ConnectSession`. Its registry entry
  // still carries `strategy: "oauth_redirect"` + a `credentialType` (for
  // that legacy callback's credential lookup), so without this explicit
  // guard `startConnect` would mint a session nothing ever completes.
  if (input.provider === "facebookAds") {
    throw connectionNotOAuthException(input.provider)
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
  const sessionReturn = await toSessionReturn(input.redirectUrl)
  const { session } = await connectionService.startSession({
    workspaceId: input.workspaceId,
    provider: input.provider,
    purpose: "connect",
    credential: resolved.credential,
    callbackUrl: resolved.callbackUrl,
    platformOwnerId: input.ownerId,
    ...sessionReturn,
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
  const sessionReturn = await toSessionReturn(input.redirectUrl)
  const { session } = await connectionService.reconnect({
    connectionId: input.connection.id,
    workspaceId: input.workspaceId,
    credential: resolved.credential,
    callbackUrl: resolved.callbackUrl,
    platformOwnerId: input.ownerId,
    ...sessionReturn,
    ...input.actor,
  })
  return { session }
}
