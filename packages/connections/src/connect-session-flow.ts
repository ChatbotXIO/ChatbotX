import { inboxService } from "@chatbotx.io/business"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import {
  authExpiresAtOf,
  type ConnectionAdapter,
  type ConnectionQuotaConsumption,
  connectionStateService,
  isActiveConnectionStatus,
} from "@chatbotx.io/business/connection"
import {
  ChatbotXException,
  connectionAlreadyConnectedException,
  connectionCredentialsRejectedException,
  connectionIdentityMismatchException,
  connectionNoCandidatesException,
  connectionNotConfiguredException,
  connectionNotOAuthException,
  connectionStateMismatchException,
  connectSessionExpiredException,
  notFoundException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import type {
  ConnectSessionOutcome,
  ConnectSessionPurpose,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import { connectionRepository } from "@chatbotx.io/database/repositories"
import type {
  ConnectionModel,
  ConnectSessionModel,
} from "@chatbotx.io/database/types"
import { encryptUtils } from "@chatbotx.io/encryption"
import type {
  AuthValue,
  ConnectionCandidate,
  ConnectionCredential,
  ConnectSessionNextAction,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  encryptedCandidatesSchema,
  resolveAdapter,
  resolveForeignKey,
  resolveOwnerId,
  saveOrInsertSatellite,
  subscribeWebhookBestEffort,
  toChannelType,
  upsertConnectionRow,
} from "./internal"
import { logger } from "./logger"

const failSession = async (
  session: Pick<ConnectSessionModel, "id" | "workspaceId" | "provider">,
  errorCode: Parameters<typeof connectSessionService.fail>[0]["errorCode"],
  statuses?: Parameters<typeof connectSessionService.fail>[0]["statuses"],
): Promise<void> => {
  try {
    await connectSessionService.fail({
      id: session.id,
      workspaceId: session.workspaceId,
      errorCode,
      ...(statuses ? { statuses } : {}),
    })
  } catch (err) {
    logger.error(
      { err, sessionId: session.id, provider: session.provider, errorCode },
      "connection OAuth: failed to record terminal connect-session state",
    )
  }
}

const toFailureOutcome = (input: {
  err: unknown
  provider: IntegrationType
  targetId: string
}): ConnectSessionOutcome => {
  if (
    input.err instanceof ChatbotXException &&
    input.err.code === "channelLimitReached"
  ) {
    return {
      targetId: input.targetId,
      status: "limitReached",
      reason: "workspaceLimit",
    }
  }
  if (
    input.err instanceof ChatbotXException &&
    input.err.code === "connectionAlreadyConnected"
  ) {
    return {
      targetId: input.targetId,
      status: "duplicated",
      reason: "alreadyConnected",
    }
  }
  logger.warn(
    { err: input.err, targetId: input.targetId, provider: input.provider },
    "connectTargets: candidate connect failed",
  )
  return {
    targetId: input.targetId,
    status: "failed",
    reason: "providerRejected",
    detail: toPublicErrorMessage(input.err, "Connect failed"),
  }
}

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
  workspaceId: string
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
  if (input.targetConnectionId) {
    const target = await connectionRepository.findByIdForWorkspace({
      id: input.targetConnectionId,
      workspaceId: input.workspaceId,
    })
    if (!target) {
      throw notFoundException("Connection not found")
    }
  }

  const sessionId = createId()
  const { session } = await connectSessionService.create({
    id: sessionId,
    workspaceId: input.workspaceId,
    provider: input.provider,
    purpose: input.purpose,
    nextAction: (nonce) => {
      const url = authorizeUrl({
        credential: input.credential,
        callbackUrl: input.callbackUrl,
        state: `${sessionId}.${nonce}`,
      })
      return { type: "open_url", url }
    },
    targetConnectionId: input.targetConnectionId,
    actorUserId: input.actorUserId,
    actorTokenId: input.actorTokenId,
    platformOwnerId: input.platformOwnerId,
    originHost: input.originHost,
    returnUrl: input.returnUrl,
  })
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
  if (session.status !== "pending") {
    throw connectSessionExpiredException(
      "This connect session is no longer active.",
    )
  }
  const adapter = resolveAdapter(session.provider)
  if (!adapter.provider.exchangeCode) {
    throw connectionNotOAuthException(session.provider)
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
    logger.warn(
      { err, sessionId: session.id, provider: session.provider },
      "connection OAuth: authorization code exchange failed",
    )
    await failSession(session, "exchange_failed", ["authorized"])
    throw connectionCredentialsRejectedException(
      toPublicErrorMessage(err, "The provider rejected the authorization."),
    )
  }

  if (session.purpose === "reconnect" && session.targetConnectionId) {
    return await completeReconnect({ session, auth })
  }

  return await listAndAttachCandidates(session, auth)
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
    logger.warn(
      { err, sessionId: session.id, provider: session.provider },
      "connection OAuth: candidate listing failed",
    )
    await failSession(session, "provider_error")
    throw connectionCredentialsRejectedException(
      toPublicErrorMessage(err, "Failed to list accounts."),
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
    if (existing && isActiveConnectionStatus(existing.status)) {
      const scope: "this_workspace" | "other_workspace" =
        existing.workspaceId === session.workspaceId
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
  const descriptor = adapter.provider.describe(auth)
  if (descriptor.sourceId !== connection.sourceId) {
    await failSession(session, "provider_denied")
    throw connectionIdentityMismatchException()
  }

  const foreignKey = resolveForeignKey(connection)
  if (!(adapter.store && foreignKey)) {
    await failSession(session, "internal_error")
    throw connectionNotConfiguredException(connection.provider)
  }
  const store = adapter.store

  const authExpiresAt = authExpiresAtOf(auth)
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
    return await db.transaction(async (tx) => {
      const integrationId = await saveOrInsertSatellite({
        tx,
        workspaceId: connection.workspaceId,
        inboxId: connection.inboxId,
        auth,
        descriptor,
        extraConfig: {},
        existing: connection,
        store,
      })
      await connectionRepository.update(
        {
          id: connection.id,
          workspaceId: connection.workspaceId,
          values: {
            authExpiresAt,
            lastError: null,
            integrationId: integrationId ?? connection.integrationId,
          },
        },
        tx,
      )
      await connectionStateService.transition({
        connectionId: connection.id,
        event: "connect.completed",
        ownerId,
        tx,
        quotaConsumption,
      })
      return await connectSessionService.completeReconnect({
        id: session.id,
        workspaceId: session.workspaceId,
        tx,
        result: {
          targetId: connection.sourceId,
          status: "connected",
          connectionId: connection.id,
        },
      })
    })
  } catch (err) {
    if (quotaConsumption.consumed && quotaConsumption.workspaceId && ownerId) {
      try {
        await connectionStateService.compensateQuotaConsumption({
          ownerId,
          workspaceId: quotaConsumption.workspaceId,
          workspaceUsageIncremented: quotaConsumption.workspaceUsageIncremented,
        })
      } catch (compensationErr) {
        logger.error(
          {
            err: compensationErr,
            sessionId: session.id,
            connectionId: connection.id,
            workspaceId: quotaConsumption.workspaceId,
            ownerId,
          },
          "connection OAuth: reconnect quota compensation failed",
        )
      }
    }
    await failSession(session, "internal_error", ["authorized"])
    throw err
  }
}

/**
 * Connects one already-authorized `ConnectionCandidate` — the per-target
 * unit of work behind `connectTargets`. Channel-kind candidates mint (or
 * revive) their `Inbox` row first via `inboxService.create`, since
 * `Connection.inboxId` must exist before `store.insertRow` and before
 * `connectionStateService.transition`'s own Inbox mirror can run;
 * `skipQuota: true` there is required — `transition`'s quota edge is the
 * sole quota consumption point on this path (see `credentials.ts
 * #connectFromCredentials`'s revive-or-insert comment), so also consuming
 * inside `inboxService.create` would charge a brand-new channel twice.
 * Otherwise mirrors `connectFromCredentials`'s revive-or-insert
 * transaction body via the shared `upsertConnectionRow`.
 *
 * Scope: a bare connect. Per-provider UI conveniences such as Messenger
 * branding, workspace-logo push, and tag-sync enqueue are not replicated
 * here; they remain owned by their app-layer actions.
 */
const connectCandidate = async (input: {
  adapter: ConnectionAdapter
  provider: IntegrationType
  workspaceId: string
  candidate: ConnectionCandidate
  ownerId: string | undefined
  actorUserId?: string | null
}): Promise<ConnectionModel> => {
  const { adapter } = input
  const { provider } = adapter
  if (!adapter.store) {
    throw connectionNotConfiguredException(input.provider)
  }
  const store = adapter.store
  const auth = input.candidate.auth
  const descriptor = provider.describe(auth)
  const extraConfig = provider.candidateToConfig?.(auth) ?? {}

  const existing = await connectionRepository.findByProviderSourceId({
    workspaceId: input.workspaceId,
    provider: input.provider,
    sourceId: descriptor.sourceId,
  })
  if (existing && isActiveConnectionStatus(existing.status)) {
    throw connectionAlreadyConnectedException()
  }

  const ownerId = input.ownerId

  const quotaConsumption: ConnectionQuotaConsumption = {
    consumed: false,
    workspaceUsageIncremented: false,
  }
  let connection: ConnectionModel
  try {
    connection = await db.transaction(async (tx) => {
      let inboxId: string | undefined
      if (provider.kind === "channel") {
        if (!ownerId) {
          throw notFoundException("Workspace owner not found")
        }
        const { inbox } = await inboxService.create({
          data: {
            workspaceId: input.workspaceId,
            channel: toChannelType(input.provider),
            sourceId: descriptor.sourceId,
            name: descriptor.displayName,
          },
          ownerId,
          tx,
          skipQuota: true,
        })
        inboxId = inbox.id
      }

      return await upsertConnectionRow({
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
        quotaConsumption,
        actorUserId: input.actorUserId,
        inboxId,
      })
    })
  } catch (err) {
    if (quotaConsumption.consumed && quotaConsumption.workspaceId && ownerId) {
      await connectionStateService.compensateQuotaConsumption({
        ownerId,
        workspaceId: quotaConsumption.workspaceId,
        workspaceUsageIncremented: quotaConsumption.workspaceUsageIncremented,
      })
    }
    throw err
  }

  return await subscribeWebhookBestEffort({
    adapter,
    auth,
    connection,
    ownerId,
  })
}

/**
 * Finishes an `awaiting_selection` connect session: atomically claims
 * each requested target (safe against a double-submit or two tabs — a
 * target claimed by another attempt is skipped until its claimant records
 * the outcome), then connects it via `connectCandidate`. Never throws for a
 * single target's failure — every attempted outcome (`connected`/
 * `duplicated`/`limitReached`/`failed`) is reported back per-target.
 */
export const connectTargets = async (input: {
  sessionId: string
  workspaceId: string
  targetIds: string[]
  actorUserId?: string | null
}): Promise<{
  session: ConnectSessionModel
  connections: ConnectionModel[]
  outcomes: ConnectSessionOutcome[]
}> => {
  const session = await connectSessionService.findByIdForWorkspace({
    id: input.sessionId,
    workspaceId: input.workspaceId,
  })
  if (!session) {
    throw notFoundException("Connect session not found")
  }
  if (session.status !== "awaiting_selection" || !session.encryptedAuth) {
    throw connectSessionExpiredException(
      "This connect session is not awaiting target selection.",
    )
  }

  const candidates = await encryptUtils.decryptObject(
    session.encryptedAuth,
    encryptedCandidatesSchema,
    `connect-session:${session.id}`,
  )
  const candidateBySourceId = new Map(
    candidates.map((candidate) => [candidate.sourceId, candidate]),
  )
  const targetById = new Map(
    session.targets.map((target) => [target.id, target]),
  )

  const outcomes: ConnectSessionOutcome[] = []
  const connections: ConnectionModel[] = []
  let updatedSession = session
  let flowError: unknown
  let flowFailed = false
  const adapter = resolveAdapter(session.provider)
  const ownerId = await resolveOwnerId({
    kind: adapter.provider.kind,
    workspaceId: input.workspaceId,
  })

  try {
    for (const targetId of input.targetIds) {
      const target = targetById.get(targetId)
      const candidate = candidateBySourceId.get(targetId)
      if (!(target && candidate)) {
        outcomes.push({ targetId, status: "failed", reason: "unknown" })
        continue
      }
      if (!target.selectable) {
        outcomes.push(
          target.alreadyConnected
            ? { targetId, status: "duplicated", reason: "alreadyConnected" }
            : { targetId, status: "failed", reason: "notSelectable" },
        )
        continue
      }

      const claimed = await connectSessionService.claimTarget({
        id: session.id,
        workspaceId: session.workspaceId,
        targetId,
      })
      if (!claimed) {
        continue
      }

      try {
        const connection = await connectCandidate({
          adapter,
          provider: session.provider,
          workspaceId: input.workspaceId,
          candidate,
          ownerId,
          actorUserId: input.actorUserId,
        })
        connections.push(connection)
        outcomes.push({
          targetId,
          status: "connected",
          connectionId: connection.id,
        })
      } catch (err) {
        // The claim above already appended `targetId` to `claimedTargetIds`;
        // every branch below ends in a non-`connected` outcome, so release it
        // — otherwise a retry's `claimTarget` permanently sees this target as
        // claimed even though it was never actually connected. Isolated in its
        // own try so a transient release failure does not skip the remaining
        // targets or persistently collected outcomes.
        try {
          await connectSessionService.releaseTarget({
            id: session.id,
            workspaceId: session.workspaceId,
            targetId,
          })
        } catch (releaseErr) {
          logger.warn(
            { err: releaseErr, targetId, provider: session.provider },
            "connectTargets: releaseTarget failed after a failed connect attempt; the target stays claimed until a later retry releases it",
          )
        }
        outcomes.push(
          toFailureOutcome({
            err,
            provider: session.provider,
            targetId,
          }),
        )
      }
    }
  } catch (err) {
    flowError = err
    flowFailed = true
  }

  const connectionIds = connections.map((connection) => connection.id)
  try {
    updatedSession = await connectSessionService.recordResults({
      id: session.id,
      workspaceId: session.workspaceId,
      results: outcomes,
      resultConnectionIds: connectionIds,
    })
  } catch (err) {
    logger.error(
      { err, sessionId: session.id, connectionIds },
      "connectTargets: failed to record collected results",
    )
    if (!flowFailed) {
      throw err
    }
  }
  if (flowFailed) {
    throw flowError
  }

  return { session: updatedSession, connections, outcomes }
}
