import { connectSessionService } from "@chatbotx.io/business/connect-session"
import {
  authExpiresAtOf,
  type ConnectionQuotaConsumption,
  connectionStateService,
  isActiveConnectionStatus,
} from "@chatbotx.io/business/connection"
import {
  connectionCredentialsRejectedException,
  connectionIdentityMismatchException,
  connectionNoCandidatesException,
  connectionNotConfiguredException,
  connectionNotOAuthException,
  connectionProviderUnavailableException,
  connectionStateMismatchException,
  connectSessionExpiredException,
  notFoundException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type {
  ConnectSessionPurpose,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import {
  connectionRepository,
  integrationInstagramRepository,
} from "@chatbotx.io/database/repositories"
import type {
  ConnectionModel,
  ConnectSessionModel,
} from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import type {
  AuthValue,
  ConnectionCandidate,
  ConnectionCredential,
  ConnectionDescriptor,
  ConnectSessionNextAction,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { failSession } from "./connect-targets"
import {
  encryptedAuthorizationSchema,
  providerFailureStatus,
  resolveAdapter,
  resolveForeignKey,
  resolveOwnerId,
  saveOrInsertSatellite,
  subscribeWebhookBestEffort,
  toConnectionProviderError,
  withQuotaCompensation,
} from "./internal"
import { logger } from "./logger"

/**
 * `oauth_redirect`/`oauth_popup` connect: creates a `ConnectSession`, then
 * builds the provider's `authorizeUrl` with `state = "{sessionId}.{nonce}"`
 * — the OAuth callback hub resolves the session from that `state` alone
 * (`ConnectSessionService.findByNonce`), before it has any other request
 * context. `credential`/`callbackUrl` are resolved by the app-layer caller
 * (tenant-aware platform credential + broker/custom-domain callback URL)
 * and passed in — this package cannot resolve them itself without
 * depending on `apps/builder`.
 */
export const startSession = async (input: {
  workspaceId?: string
  /**
   * First-channel path only (mutually exclusive with `workspaceId`):
   * resolves-or-creates the user's workspace and inserts this session in
   * the SAME transaction. A failure anywhere in this call (session cap,
   * DB error) then rolls the just-created workspace back with it, instead
   * of leaving an empty orphan workspace behind when the connect attempt
   * never even reaches the provider (M-7) — the app-layer caller supplies
   * this instead of a plain `workspaceId` precisely so the insert it does
   * (`workspaceService.create`) can run against this package's `tx`.
   */
  createWorkspace?: (tx: DatabaseClient) => Promise<{ id: string }>
  provider: IntegrationType
  purpose: ConnectSessionPurpose
  credential: ConnectionCredential
  callbackUrl: string
  targetConnectionId?: string | null
  actorUserId?: string | null
  actorTokenId?: string | null
  platformOwnerId?: string | null
  originHost?: string | null
  returnUrl?: string | null
}): Promise<{
  session: ConnectSessionModel
  nextAction: ConnectSessionNextAction
}> => {
  const adapter = resolveAdapter(input.provider)
  const authorizeUrl = adapter.provider.authorizeUrl
  if (!authorizeUrl) {
    throw connectionNotOAuthException(input.provider)
  }
  const { workspaceId, createWorkspace } = input
  if (Boolean(workspaceId) === Boolean(createWorkspace)) {
    throw new Error(
      "startSession requires exactly one of workspaceId/createWorkspace",
    )
  }

  const sessionId = createId()
  const buildSessionInsertInput = (resolvedWorkspaceId: string) => ({
    id: sessionId,
    workspaceId: resolvedWorkspaceId,
    provider: input.provider,
    purpose: input.purpose,
    nextAction: (nonce: string) => {
      const url = authorizeUrl({
        credential: input.credential,
        callbackUrl: input.callbackUrl,
        state: `${sessionId}.${nonce}`,
      })
      return { type: "open_url" as const, url }
    },
    targetConnectionId: input.targetConnectionId,
    actorUserId: input.actorUserId,
    actorTokenId: input.actorTokenId,
    platformOwnerId: input.platformOwnerId,
    originHost: input.originHost,
    returnUrl: input.returnUrl,
  })

  const verifyTargetOwnership = async (resolvedWorkspaceId: string) => {
    if (!input.targetConnectionId) {
      return
    }
    const target = await connectionRepository.findByIdForWorkspace({
      id: input.targetConnectionId,
      workspaceId: resolvedWorkspaceId,
    })
    if (!target) {
      throw notFoundException("Connection not found")
    }
  }

  let session: ConnectSessionModel
  if (createWorkspace) {
    session = await db.transaction(async (tx) => {
      const workspace = await createWorkspace(tx)
      await verifyTargetOwnership(workspace.id)
      const created = await connectSessionService.create(
        buildSessionInsertInput(workspace.id),
        tx,
      )
      return created.session
    })
  } else {
    await verifyTargetOwnership(workspaceId as string)
    const created = await connectSessionService.create(
      buildSessionInsertInput(workspaceId as string),
    )
    session = created.session
  }
  if (!session.nextAction) {
    throw new Error(
      "Connect session was created without an authorization action",
    )
  }
  return { session, nextAction: session.nextAction }
}

/**
 * OAuth callback exchange: resolves the session by its `state` nonce,
 * exchanges `code` for `auth`, lists connectable candidates, and persists
 * them as session targets — `attachAuthorization` always lands on
 * `awaiting_selection`; auto-completing a single-target/non-multi-account
 * provider is the caller's job (it has the `ConnectionProvider` in scope
 * to check `multiAccount` and can immediately follow with
 * `connectTargets`).
 */
export const completeAuthorization = async (input: {
  sessionId: string
  nonce: string
  code: string
  callbackUrl: string
  credential: ConnectionCredential
}): Promise<ConnectSessionModel> => {
  const session = await connectSessionService.findByNonce(input.nonce)
  if (!session || session.id !== input.sessionId) {
    throw connectionStateMismatchException()
  }
  const adapter = resolveAdapter(session.provider)
  if (!adapter.provider.exchangeCode) {
    throw connectionNotOAuthException(session.provider)
  }
  if (session.status === "authorized" && session.encryptedAuth) {
    const auth = await encryptUtils.decryptObject(
      session.encryptedAuth,
      encryptedAuthorizationSchema,
      `connect-session:${session.id}:authorization`,
    )
    return await listAndAttachCandidates(session, auth)
  }
  if (session.status !== "pending") {
    throw connectSessionExpiredException(
      "This connect session is no longer active.",
    )
  }

  // OAuth providers consume authorization codes once. The compare-and-set
  // immediately before the exchange permits exactly one callback to use it.
  await connectSessionService.claimAuthorization({
    id: session.id,
    workspaceId: session.workspaceId,
  })

  let auth: AuthValue
  try {
    auth = await adapter.provider.exchangeCode({
      code: input.code,
      callbackUrl: input.callbackUrl,
      credential: input.credential,
    })
  } catch (err) {
    const providerError = toConnectionProviderError(err)
    const retryStatus = providerFailureStatus(providerError)
    logger.warn(
      { err: providerError, sessionId: session.id, provider: session.provider },
      "connection OAuth: authorization code exchange failed",
    )
    if (retryStatus) {
      await connectSessionService.releaseAuthorization({
        id: session.id,
        workspaceId: session.workspaceId,
      })
      throw connectionProviderUnavailableException(retryStatus)
    }
    await failSession(session, "exchange_failed", ["authorized"])
    throw connectionCredentialsRejectedException(
      toPublicErrorMessage(
        providerError,
        "The provider rejected the authorization.",
      ),
    )
  }

  if (session.purpose === "reconnect" && session.targetConnectionId) {
    return await completeReconnect({ session, auth })
  }

  let authorizedSession: ConnectSessionModel
  try {
    const encryptedAuth = await encryptUtils.encryptObject(
      auth,
      `connect-session:${session.id}:authorization`,
    )
    authorizedSession = await connectSessionService.storeAuthorization({
      id: session.id,
      workspaceId: session.workspaceId,
      encryptedAuth,
    })
  } catch (err) {
    await failSession(session, "internal_error", ["authorized"])
    throw err
  }
  return await listAndAttachCandidates(authorizedSession, auth)
}

/**
 * Lists connectable candidates for an already-obtained `auth` and
 * persists them as the session's `awaiting_selection` targets. Split out
 * of `completeAuthorization` so a provider whose credential can be
 * satisfied without a fresh OAuth round trip — Messenger's Facebook-SSO
 * token reuse (`tryReuseFacebookSsoToken`), which skips the OAuth dialog
 * entirely when the user's existing Facebook login already carries every
 * required scope — can reach `awaiting_selection` directly from an
 * app-layer-constructed `auth`, without a `code`/`nonce` to exchange.
 */
export const listAndAttachCandidates = async (
  session: ConnectSessionModel,
  auth: AuthValue,
): Promise<ConnectSessionModel> => {
  const adapter = resolveAdapter(session.provider)

  let candidates: Awaited<
    ReturnType<NonNullable<typeof adapter.provider.listCandidates>>
  >
  try {
    candidates = adapter.provider.listCandidates
      ? await adapter.provider.listCandidates({ auth })
      : [{ ...adapter.provider.describe(auth), auth }]
  } catch (err) {
    const providerError = toConnectionProviderError(err)
    const retryStatus = providerFailureStatus(providerError)
    logger.warn(
      { err: providerError, sessionId: session.id, provider: session.provider },
      "connection OAuth: candidate listing failed",
    )
    if (retryStatus) {
      throw connectionProviderUnavailableException(retryStatus)
    }
    await failSession(session, "provider_error")
    throw connectionCredentialsRejectedException(
      toPublicErrorMessage(providerError, "Failed to list accounts."),
    )
  }

  if (candidates.length === 0) {
    await failSession(session, "no_candidates")
    throw connectionNoCandidatesException()
  }

  const sourceIds = candidates
    .filter((candidate) => !candidate.alreadyConnected)
    .map((candidate) => candidate.sourceId)
  const existingConnections =
    await connectionRepository.findByProviderAndSourceIdsAnyWorkspace({
      provider: session.provider,
      sourceIds,
    })
  const existingBySourceId = new Map<string, ConnectionModel>()
  for (const existing of existingConnections) {
    if (!existingBySourceId.has(existing.sourceId)) {
      existingBySourceId.set(existing.sourceId, existing)
    }
  }

  // `instagram` (native login) and `instagramFacebook` (linked via Facebook)
  // share one physical `IntegrationInstagram.igId` identity column but are
  // stored under distinct `Connection.provider` values, so the
  // provider-scoped lookup above can never see a sourceId already connected
  // under the sibling provider — even once every legacy row has been
  // backfilled into `Connection`. Cross-check the shared satellite column
  // directly so the picker still greys out an account connected via the
  // other login path. A satellite row surviving a `needs_reauth`/`paused`
  // connection must NOT grey out the candidate — only an ACTIVE sibling
  // connection does (`findActiveWorkspacesByIgIds` joins through to the
  // real `Connection` status so a needs_reauth/paused row stays selectable
  // for reconnect).
  const crossProviderWorkspaceByIgId = new Map<string, string>()
  if (
    (session.provider === "instagram" ||
      session.provider === "instagramFacebook") &&
    sourceIds.length > 0
  ) {
    const rows =
      await integrationInstagramRepository.findActiveWorkspacesByIgIds({
        igIds: sourceIds,
      })
    for (const row of rows) {
      crossProviderWorkspaceByIgId.set(row.igId, row.workspaceId)
    }
  }
  const targets = candidates.map((candidate) => {
    if (candidate.alreadyConnected) {
      return {
        id: candidate.sourceId,
        name: candidate.displayName,
        avatarUrl: candidate.avatarUrl,
        selectable: false,
        alreadyConnected: candidate.alreadyConnected,
      }
    }
    const existing = existingBySourceId.get(candidate.sourceId)
    const crossProviderWorkspaceId = crossProviderWorkspaceByIgId.get(
      candidate.sourceId,
    )
    if (
      (existing && isActiveConnectionStatus(existing.status)) ||
      crossProviderWorkspaceId
    ) {
      const connectedWorkspaceId =
        existing?.workspaceId ?? crossProviderWorkspaceId
      const scope: "this_workspace" | "other_workspace" =
        connectedWorkspaceId === session.workspaceId
          ? "this_workspace"
          : "other_workspace"
      return {
        id: candidate.sourceId,
        name: candidate.displayName,
        avatarUrl: candidate.avatarUrl,
        selectable: false,
        alreadyConnected: scope,
      }
    }
    return {
      id: candidate.sourceId,
      name: candidate.displayName,
      avatarUrl: candidate.avatarUrl,
      selectable: true,
    }
  })

  // Encrypts the full candidate list — not just the exchanged `auth` — so
  // each candidate's own distinct `auth` (a multi-account provider's
  // per-page token, e.g. Messenger) survives to `connectTargets`. For a
  // single-target/`describe()`-fallback provider this is a one-element
  // array holding the same `auth` `exchangeCode` returned. AAD binds the
  // ciphertext to this exact session so it cannot be replayed against
  // another session's row.
  const encryptedAuth = await encryptUtils.encryptObject(
    candidates,
    `connect-session:${session.id}`,
  )
  return await connectSessionService.attachAuthorization({
    id: session.id,
    workspaceId: session.workspaceId,
    encryptedAuth,
    targets,
  })
}

/**
 * `completeAuthorization`'s reconnect path: verifies the freshly
 * re-authorized identity (`provider.describe(auth).sourceId`) matches the
 * target `Connection`'s own `sourceId` — a user can grant access to a
 * DIFFERENT account than the one being reconnected, which must not
 * silently overwrite the wrong connection's auth — then saves the new
 * auth and transitions the connection back to healthy.
 */
const completeReconnect = async (input: {
  session: ConnectSessionModel
  auth: AuthValue
}): Promise<ConnectSessionModel> => {
  const { session, auth } = input
  const targetConnectionId = session.targetConnectionId
  if (!targetConnectionId) {
    throw notFoundException("Connection not found")
  }
  const connection = await connectionRepository.findByIdForWorkspace({
    id: targetConnectionId,
    workspaceId: session.workspaceId,
  })
  if (!connection) {
    await failSession(session, "internal_error")
    throw notFoundException("Connection not found")
  }

  const adapter = resolveAdapter(connection.provider)
  let candidate: ConnectionCandidate | undefined
  try {
    candidate = adapter.provider.listCandidates
      ? (await adapter.provider.listCandidates({ auth })).find(
          ({ sourceId }) => sourceId === connection.sourceId,
        )
      : undefined
  } catch (err) {
    await failSession(session, "internal_error", ["authorized"])
    throw err
  }
  if (adapter.provider.listCandidates && !candidate) {
    await failSession(session, "provider_denied", ["authorized"])
    throw connectionIdentityMismatchException()
  }
  const reconnectAuth = candidate?.auth ?? auth
  let descriptor: ConnectionDescriptor
  try {
    descriptor = adapter.provider.describe(reconnectAuth)
  } catch (err) {
    await failSession(session, "internal_error", ["authorized"])
    throw err
  }
  // A `legacy:`-prefixed `sourceId` marks a row `backfill-connections.ts`
  // could not resolve a real sourceId for at migration time — accept it as
  // a match on this first reconnect and overwrite it with the descriptor's
  // real sourceId below, instead of rejecting it as an identity mismatch.
  const isLegacySourceId = connection.sourceId.startsWith("legacy:")
  if (descriptor.sourceId !== connection.sourceId && !isLegacySourceId) {
    await failSession(session, "provider_denied", ["authorized"])
    throw connectionIdentityMismatchException()
  }

  const foreignKey = resolveForeignKey(connection)
  if (!(adapter.store && foreignKey)) {
    await failSession(session, "internal_error")
    throw connectionNotConfiguredException(connection.provider)
  }
  const store = adapter.store

  const authExpiresAt = authExpiresAtOf(reconnectAuth)
  // `connect.completed`, not `auth.saved`/`recordAuthSaved` — `auth.saved`
  // requires the connection to already be ACTIVE (`connected`/`degraded`)
  // and throws otherwise (`state.ts`), but reconnect's whole purpose is
  // reviving an INACTIVE (`needs_reauth`/`disconnected`) connection.
  // `connect.completed` is the FSM event that actually allows that edge
  // (and consumes quota on it for a channel-kind connection) — the same
  // event `connectFromCredentials`'s revive path uses.
  const ownerId = await resolveOwnerId(connection)
  const quotaConsumption: ConnectionQuotaConsumption = {
    consumed: false,
    workspaceUsageIncremented: false,
  }
  try {
    const { session: updatedSession, connection: updatedConnection } =
      await withQuotaCompensation(
        {
          ownerId,
          quotaConsumption,
          context: {
            connectionId: connection.id,
            sessionId: session.id,
          },
        },
        async () =>
          await db.transaction(async (tx) => {
            const integrationId = await saveOrInsertSatellite({
              tx,
              workspaceId: connection.workspaceId,
              kind: connection.kind,
              inboxId: connection.inboxId,
              auth: reconnectAuth,
              descriptor,
              extraConfig:
                adapter.provider.candidateToConfig?.(reconnectAuth) ?? {},
              existing: connection,
              store,
            })
            const updatedConnectionRow = await connectionRepository.update(
              {
                id: connection.id,
                workspaceId: connection.workspaceId,
                values: {
                  authExpiresAt,
                  lastError: null,
                  integrationId: integrationId ?? connection.integrationId,
                  ...(isLegacySourceId
                    ? { sourceId: descriptor.sourceId }
                    : {}),
                },
              },
              tx,
            )
            if (!updatedConnectionRow) {
              throw notFoundException("Connection not found")
            }
            const transitioned = await connectionStateService.transition({
              connectionId: connection.id,
              event: "connect.completed",
              ownerId,
              tx,
              quotaConsumption,
            })
            const completedSession =
              await connectSessionService.completeReconnect({
                id: session.id,
                workspaceId: session.workspaceId,
                tx,
                result: {
                  targetId: descriptor.sourceId,
                  status: "connected",
                  connectionId: connection.id,
                },
              })
            return { session: completedSession, connection: transitioned }
          }),
      )
    // Mirrors `connectAndPersist`'s best-effort webhook subscribe, run after
    // the transaction commits — a subscribe failure degrades the already-
    // persisted connection rather than rolling back a successful reconnect.
    await subscribeWebhookBestEffort({
      adapter,
      auth: reconnectAuth,
      connection: updatedConnection,
      ownerId,
    })
    return updatedSession
  } catch (err) {
    await failSession(session, "internal_error", ["authorized"])
    throw err
  }
}
