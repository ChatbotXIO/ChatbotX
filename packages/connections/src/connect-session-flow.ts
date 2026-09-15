import { inboxService } from "@chatbotx.io/business"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import {
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
  ChannelType,
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
  ConnectNextAction,
} from "@chatbotx.io/sdk"
import {
  encryptedCandidatesSchema,
  resolveAdapter,
  resolveForeignKey,
  resolveOwnerId,
  subscribeWebhookBestEffort,
  toChannelType,
  upsertConnectionRow,
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
  nextAction: ConnectNextAction
}> => {
  const adapter = resolveAdapter(input.provider)
  if (!adapter.provider.authorizeUrl) {
    throw connectionNotOAuthException(input.provider)
  }

  const { session, nonce } = await connectSessionService.create({
    workspaceId: input.workspaceId,
    provider: input.provider,
    purpose: input.purpose,
    targetConnectionId: input.targetConnectionId,
    actorUserId: input.actorUserId,
    actorTokenId: input.actorTokenId,
    platformOwnerId: input.platformOwnerId,
    originHost: input.originHost,
    returnUrl: input.returnUrl,
  })

  const url = adapter.provider.authorizeUrl({
    credential: input.credential,
    callbackUrl: input.callbackUrl,
    state: `${session.id}.${nonce}`,
  })
  const nextAction: ConnectNextAction = { type: "open_url", url }
  const updated = await connectSessionService.submitInput({
    id: session.id,
    nextAction,
  })
  return { session: updated, nextAction }
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
  // No local atomic claim on the session before `exchangeCode` (unlike
  // `claimTarget`'s DB-level compare-and-set) — two concurrent calls for
  // the same session could both pass this `status === "pending"` check
  // and both call `exchangeCode` with the same `code`. Relies on the
  // OAuth provider enforcing single-use authorization codes, which every
  // provider this connects to does; a genuinely idempotent version would
  // need its own compare-and-set (e.g. `pending` -> `authorizing`) here.

  const adapter = resolveAdapter(session.provider)
  if (!adapter.provider.exchangeCode) {
    throw connectionNotOAuthException(session.provider)
  }

  let auth: AuthValue
  try {
    auth = await adapter.provider.exchangeCode({
      code: input.code,
      callbackUrl: input.callbackUrl,
      credential: input.credential,
    })
  } catch (err) {
    // The genuine "user clicked cancel" case is filtered upstream — the
    // OAuth callback handler checks `?error=...` and marks the session
    // `provider_denied` BEFORE ever calling `completeAuthorization` with
    // a `code` (see `apps/builder/src/app/integrations/[...integration]/callback.ts`).
    // Every failure that reaches this catch is therefore the token
    // exchange itself failing — network error, malformed response, or the
    // provider rejecting an invalid/expired code — never an explicit
    // denial, so it gets its own distinct terminal code rather than
    // reusing `provider_denied`.
    await connectSessionService.fail({
      id: session.id,
      errorCode: "exchange_failed",
    })
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
    await connectSessionService.fail({
      id: session.id,
      errorCode: "provider_error",
    })
    throw new Error(toPublicErrorMessage(err, "Failed to list accounts."))
  }

  if (candidates.length === 0) {
    await connectSessionService.fail({
      id: session.id,
      errorCode: "no_candidates",
    })
    throw connectionNoCandidatesException()
  }

  const targets = await Promise.all(
    candidates.map(async (candidate) => {
      if (candidate.alreadyConnected) {
        return {
          id: candidate.sourceId,
          name: candidate.displayName,
          avatarUrl: candidate.avatarUrl,
          selectable: false,
          alreadyConnected: candidate.alreadyConnected,
        }
      }
      const existing =
        await connectionRepository.findByProviderAndSourceIdAnyWorkspace({
          provider: session.provider,
          sourceId: candidate.sourceId,
        })
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
    }),
  )

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
  const connection = await connectionRepository.findById({
    id: targetConnectionId,
  })
  if (!connection) {
    await connectSessionService.fail({
      id: session.id,
      errorCode: "internal_error",
    })
    throw notFoundException("Connection not found")
  }

  const adapter = resolveAdapter(connection.provider)
  const descriptor = adapter.provider.describe(auth)
  if (descriptor.sourceId !== connection.sourceId) {
    await connectSessionService.fail({
      id: session.id,
      errorCode: "provider_denied",
    })
    throw connectionIdentityMismatchException()
  }

  const foreignKey = resolveForeignKey(connection)
  if (!(adapter.store && foreignKey)) {
    await connectSessionService.fail({
      id: session.id,
      errorCode: "internal_error",
    })
    throw connectionNotConfiguredException(connection.provider)
  }
  const store = adapter.store

  const authExpiresAt =
    auth.authType === "oauth2" && auth.tokens.expiresAt
      ? new Date(auth.tokens.expiresAt)
      : null
  // `connect.completed`, not `auth.saved`/`recordAuthSaved` — `auth.saved`
  // requires the connection to already be ACTIVE (`connected`/`degraded`)
  // and throws otherwise (`state.ts`), but reconnect's whole purpose is
  // reviving an INACTIVE (`needs_reauth`/`disconnected`) connection.
  // `connect.completed` is the FSM event that actually allows that edge
  // (and consumes quota on it for a channel-kind connection) — the same
  // event `connectFromCredentials`'s revive path uses.
  const ownerId = await resolveOwnerId(connection)
  await db.transaction(async (tx) => {
    await store.saveAuthByForeignKey(foreignKey, auth, tx)
    await connectionRepository.update(
      { id: connection.id, values: { authExpiresAt, lastError: null } },
      tx,
    )
    await connectionStateService.transition({
      connectionId: connection.id,
      event: "connect.completed",
      ownerId,
      tx,
    })
  })

  return await connectSessionService.recordResults({
    id: session.id,
    results: [
      {
        targetId: connection.sourceId,
        status: "connected",
        connectionId: connection.id,
      },
    ],
    resultConnectionIds: [connection.id],
  })
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
 * Scope: a *bare* connect. The per-provider UI conveniences a
 * picker-driven connect layers on top (Messenger's persistent-menu
 * branding, workspace-logo push, tag-sync enqueue — see
 * `apps/builder/src/features/integration-messenger/actions/connect-page.ts`)
 * are NOT replicated here; `ConnectionProvider.actions` (reserved) is the
 * intended future home for a client to opt into any of those separately.
 */
const connectCandidate = async (input: {
  workspaceId: string
  provider: IntegrationType
  candidate: ConnectionCandidate
  actorUserId?: string | null
}): Promise<ConnectionModel> => {
  const adapter = resolveAdapter(input.provider)
  const { provider } = adapter
  if (!adapter.store) {
    throw connectionNotConfiguredException(input.provider)
  }
  const store = adapter.store
  const auth = input.candidate.auth as AuthValue
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

  const ownerId = await resolveOwnerId({
    kind: provider.kind,
    workspaceId: input.workspaceId,
  })

  const connection = await db.transaction(async (tx) => {
    let inboxId: string | undefined
    if (provider.kind === "channel") {
      if (!ownerId) {
        throw notFoundException("Workspace owner not found")
      }
      const { inbox } = await inboxService.create({
        data: {
          workspaceId: input.workspaceId,
          channel: toChannelType(input.provider) as ChannelType,
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
      actorUserId: input.actorUserId,
      inboxId,
    })
  })

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
 * target claimed by a prior call maps to a `duplicated` outcome, never a
 * second connect), then connects it via `connectCandidate`. Never throws
 * for a single target's failure — every outcome (`connected`/
 * `duplicated`/`limitReached`/`failed`) is reported back per-target, the
 * same vocabulary `CONNECT_ITEM_STATUSES` uses for the picker flows this
 * replaces.
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

  const outcomes: ConnectSessionOutcome[] = []
  const connections: ConnectionModel[] = []

  for (const targetId of input.targetIds) {
    const target = session.targets.find((t) => t.id === targetId)
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
      targetId,
    })
    if (!claimed) {
      outcomes.push({
        targetId,
        status: "duplicated",
        reason: "alreadyConnected",
      })
      continue
    }

    try {
      const connection = await connectCandidate({
        workspaceId: input.workspaceId,
        provider: session.provider,
        candidate: candidate as ConnectionCandidate,
        actorUserId: input.actorUserId,
      })
      connections.push(connection)
      outcomes.push({
        targetId,
        status: "connected",
        connectionId: connection.id,
      })
    } catch (err) {
      if (
        err instanceof ChatbotXException &&
        err.code === "channelLimitReached"
      ) {
        outcomes.push({
          targetId,
          status: "limitReached",
          reason: "workspaceLimit",
        })
      } else if (
        err instanceof ChatbotXException &&
        err.code === "connectionAlreadyConnected"
      ) {
        outcomes.push({
          targetId,
          status: "duplicated",
          reason: "alreadyConnected",
        })
      } else {
        logger.warn(
          { err, targetId, provider: session.provider },
          "connectTargets: candidate connect failed",
        )
        outcomes.push({
          targetId,
          status: "failed",
          reason: "providerRejected",
          detail: toPublicErrorMessage(err, "Connect failed"),
        })
      }
    }
  }

  const updatedSession = await connectSessionService.recordResults({
    id: session.id,
    results: outcomes,
    resultConnectionIds: connections.map((connection) => connection.id),
  })

  return { session: updatedSession, connections, outcomes }
}
