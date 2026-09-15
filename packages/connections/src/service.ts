import { inboxService, workspaceMemberService } from "@chatbotx.io/business"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import {
  type ConnectionAdapter,
  connectionStateService,
  isActiveConnectionStatus,
} from "@chatbotx.io/business/connection"
import {
  ChatbotXException,
  connectionAlreadyConnectedException,
  connectionCredentialsRejectedException,
  connectionIdentityMismatchException,
  connectionInactiveException,
  connectionNoCandidatesException,
  connectionNotConfiguredException,
  connectionNotOAuthException,
  connectionNotRefreshableException,
  connectionStateMismatchException,
  connectionWrongStrategyException,
  connectSessionExpiredException,
  notFoundException,
  toPublicErrorMessage,
  validationException,
} from "@chatbotx.io/business/errors"
import { db, isUniqueViolationError } from "@chatbotx.io/database/client"
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
  AuthStore,
  AuthValue,
  ConnectionCandidate,
  ConnectionConfigField,
  ConnectionCredential,
  ConnectNextAction,
} from "@chatbotx.io/sdk"
import { z } from "zod"
import { logger } from "./logger"
import { CONNECTION_REGISTRY } from "./registry"

/**
 * What a session's `encryptedAuth` blob actually holds once
 * `completeAuthorization` lists candidates: the full `ConnectionCandidate[]`
 * (each with its own `auth`), not just the single exchanged `auth` — a
 * multi-account provider (Messenger) hands back one distinct per-page auth
 * per candidate. `auth` itself is provider-specific and unvalidated here
 * (same trust boundary as `asAuthValue` in `store-bindings.ts`); everything
 * else mirrors `ConnectSessionTarget`.
 */
const encryptedCandidatesSchema = z.array(
  z.object({
    sourceId: z.string(),
    displayName: z.string(),
    authExpiresAt: z.string().optional(),
    avatarUrl: z.string().optional(),
    alreadyConnected: z.enum(["this_workspace", "other_workspace"]).optional(),
    auth: z.unknown(),
  }),
)

/**
 * The FK a `Connection` row actually carries to its satellite row —
 * `inboxId` for channels, `integrationId` for workspace integrations. `null`
 * only for `chatbotx` (no satellite table at all).
 */
const resolveForeignKey = (connection: ConnectionModel): string | null =>
  connection.inboxId ?? connection.integrationId ?? null

/**
 * Validates a raw `config` object (a credential-strategy `connect` request
 * body) against a provider's `configFields` declaration, coercing each
 * value to its declared type. Throws the same `validationException` shape
 * every other service uses, field-scoped, so a public/private API caller
 * can attach it to the right form field without special-casing this path.
 */
const parseConfig = (
  configFields: readonly ConnectionConfigField[],
  rawConfig: Record<string, unknown>,
): Record<string, unknown> => {
  const parsed: Record<string, unknown> = {}
  for (const field of configFields) {
    const value = rawConfig[field.name]
    if (value === undefined || value === null || value === "") {
      if (field.required) {
        throw validationException(field.name, `${field.name} is required`)
      }
      continue
    }
    switch (field.type) {
      case "string":
      case "secret":
      case "url":
        if (typeof value !== "string") {
          throw validationException(
            field.name,
            `${field.name} must be a string`,
          )
        }
        parsed[field.name] = value
        break
      case "number": {
        const num = typeof value === "number" ? value : Number(value)
        if (Number.isNaN(num)) {
          throw validationException(
            field.name,
            `${field.name} must be a number`,
          )
        }
        parsed[field.name] = num
        break
      }
      case "boolean":
        if (typeof value !== "boolean") {
          throw validationException(
            field.name,
            `${field.name} must be a boolean`,
          )
        }
        parsed[field.name] = value
        break
      case "enum":
        if (typeof value !== "string" || !field.enumValues?.includes(value)) {
          throw validationException(
            field.name,
            `${field.name} must be one of ${(field.enumValues ?? []).join(", ")}`,
          )
        }
        parsed[field.name] = value
        break
      default: {
        const exhaustive: never = field.type
        throw new Error(`Unhandled connection config field type: ${exhaustive}`)
      }
    }
  }
  return parsed
}

/**
 * Registry-aware orchestration over the `Connection` domain: provider-side
 * teardown/refresh/health-check calls plus the store-binding CRUD, delegating
 * every status write to the registry-free `connectionStateService`. Lives in
 * `@chatbotx.io/connections` (not `@chatbotx.io/business`) because it needs
 * the full `CONNECTION_REGISTRY`, which itself depends on `business` — see
 * the placement note on `connectionStateService`.
 */
class ConnectionService {
  private resolveAdapter(provider: string): ConnectionAdapter {
    const adapter =
      CONNECTION_REGISTRY[provider as keyof typeof CONNECTION_REGISTRY]
    if (!adapter) {
      throw connectionNotConfiguredException(provider)
    }
    return adapter
  }

  private async findOrThrow(input: {
    connectionId: string
    workspaceId: string
  }): Promise<ConnectionModel> {
    const connection = await connectionRepository.findByIdForWorkspace({
      id: input.connectionId,
      workspaceId: input.workspaceId,
    })
    if (!connection) {
      throw notFoundException("Connection not found")
    }
    return connection
  }

  /**
   * Best-effort `provider.webhook.subscribe` right after a fresh
   * `connect.completed` — the FSM design's own "webhook.subscribe
   * best-effort (failure → degraded, lastError)" edge (`state.ts`'s
   * `verify.failed_non_auth`), mirrored from `disconnect`'s existing
   * best-effort `webhook.unsubscribe` call. Never throws: a subscribe
   * failure degrades the just-created connection instead of failing the
   * whole connect (the row and quota consumption already committed).
   */
  private async subscribeWebhookBestEffort(input: {
    adapter: ConnectionAdapter
    auth: AuthValue
    connection: ConnectionModel
    ownerId: string | undefined
  }): Promise<ConnectionModel> {
    if (!input.adapter.provider.webhook) {
      return input.connection
    }
    try {
      await input.adapter.provider.webhook.subscribe({ auth: input.auth })
      return input.connection
    } catch (err) {
      logger.warn(
        {
          err,
          connectionId: input.connection.id,
          provider: input.connection.provider,
        },
        "connect: webhook subscribe failed, marking connection degraded",
      )
      return await connectionStateService.transition({
        connectionId: input.connection.id,
        event: "verify.failed_non_auth",
        reason: "verify_failed",
        ownerId: input.ownerId,
      })
    }
  }

  /**
   * Resolves the workspace-owner user id for the FSM's quota edge —
   * `undefined` for anything but a `kind: "channel"` connection, since
   * `ConnectionStateService.applyQuotaEdge` always targets the `"channels"`
   * metric. Passing an owner for a workspace-integration connection (AI
   * providers, marketing tools) would incorrectly consume/release a
   * channel-quota slot when that row crosses the active/inactive boundary.
   */
  private async resolveOwnerId(
    connection: Pick<ConnectionModel, "kind" | "workspaceId">,
  ): Promise<string | undefined> {
    if (connection.kind !== "channel") {
      return
    }
    return await workspaceMemberService.findOwnerUserIdByWorkspaceId({
      workspaceId: connection.workspaceId,
    })
  }

  /**
   * User-initiated teardown: best-effort provider-side disconnect + webhook
   * unsubscribe (never blocks the local state transition on an upstream
   * failure), then the satellite row's own `onDisconnect` policy
   * (`delete_row`/`keep_row`), then the FSM transition.
   *
   * Scope note: this is the **generic** disconnect path shared by every
   * provider. Bespoke per-provider teardown side effects that predate the
   * Connection domain — messenger's shared-IG-page `general_info`
   * preservation, WhatsApp's coexist/staging cleanup, TikTok/Zalo specifics —
   * are NOT ported here; those remain in their existing per-channel disconnect
   * actions until a dedicated follow-up audits each one individually.
   */
  async disconnect(input: {
    connectionId: string
    workspaceId: string
  }): Promise<ConnectionModel> {
    const connection = await this.findOrThrow(input)
    const adapter = this.resolveAdapter(connection.provider)
    const foreignKey = resolveForeignKey(connection)

    if (adapter.store && foreignKey) {
      try {
        const auth = await adapter.store.loadAuthByForeignKey(foreignKey)
        if (adapter.integration) {
          await adapter.integration.disconnect(auth)
        }
        if (adapter.provider.webhook) {
          await adapter.provider.webhook.unsubscribe({ auth })
        }
      } catch (err) {
        logger.warn(
          { err, connectionId: connection.id, provider: connection.provider },
          "connection disconnect: provider-side teardown failed, proceeding with local disconnect",
        )
      }
      await adapter.store.deleteRowByForeignKey(foreignKey)
    }

    const ownerId = await this.resolveOwnerId(connection)
    return await connectionStateService.transition({
      connectionId: connection.id,
      event: "user.disconnect",
      ownerId,
    })
  }

  /** Forces `refreshAuth` regardless of expiry — `POST /v1/connections/{id}/refresh`. */
  async refresh(input: {
    connectionId: string
    workspaceId: string
  }): Promise<ConnectionModel> {
    const connection = await this.findOrThrow(input)
    if (!isActiveConnectionStatus(connection.status)) {
      throw connectionInactiveException()
    }
    const adapter = this.resolveAdapter(connection.provider)
    if (!adapter.integration?.refreshAuth) {
      throw connectionNotRefreshableException(connection.provider)
    }
    if (!adapter.store) {
      throw connectionNotConfiguredException(connection.provider)
    }
    const foreignKey = resolveForeignKey(connection)
    if (!foreignKey) {
      throw connectionNotConfiguredException(connection.provider)
    }
    const store = adapter.store

    const auth = await store.loadAuthByForeignKey(foreignKey)
    const authStore: AuthStore<AuthValue> = {
      load: async () => await store.loadAuthByForeignKey(foreignKey),
      save: async (newAuth) => {
        await store.saveAuthByForeignKey(foreignKey, newAuth)
        const authExpiresAt =
          newAuth.authType === "oauth2" && newAuth.tokens.expiresAt
            ? new Date(newAuth.tokens.expiresAt)
            : null
        await connectionStateService.recordAuthSaved({
          connectionId: connection.id,
          authExpiresAt,
        })
      },
      markOffline: async () => {
        const ownerId = await this.resolveOwnerId(connection)
        await connectionStateService.markUnhealthy({
          connectionId: connection.id,
          ownerId,
        })
      },
    }

    // `refreshAuth`/`ensureFreshAuth` only ever read `ctx.auth`/`ctx.authStore`
    // (never `ctx.platform`/`ctx.storagePrefix`/`ctx.integrationDetail`) —
    // see `Integration.refreshAndPersist` in `@chatbotx.io/sdk`. The
    // `platform` stub below is structurally required but never invoked on
    // this path.
    await adapter.integration.ensureFreshAuth(
      {
        storagePrefix: "",
        auth,
        authStore,
        platform: {
          appUrl: "",
          wsUrl: "",
          storageUrl: "",
          getRealtimeAuthHeaders: async () => ({}),
        },
      },
      { force: true },
    )

    const refreshed = await connectionRepository.findById({
      id: connection.id,
    })
    if (!refreshed) {
      throw notFoundException("Connection not found")
    }
    return refreshed
  }

  /** Live health check without a refresh cycle — `POST /v1/connections/{id}/verify`. */
  async verify(input: {
    connectionId: string
    workspaceId: string
  }): Promise<ConnectionModel> {
    const connection = await this.findOrThrow(input)
    if (!isActiveConnectionStatus(connection.status)) {
      throw connectionInactiveException()
    }
    const adapter = this.resolveAdapter(connection.provider)
    if (!adapter.store) {
      throw connectionNotConfiguredException(connection.provider)
    }
    const foreignKey = resolveForeignKey(connection)
    if (!foreignKey) {
      throw connectionNotConfiguredException(connection.provider)
    }

    const auth = await adapter.store.loadAuthByForeignKey(foreignKey)
    const health = await adapter.provider.verify({ auth })
    const ownerId = await this.resolveOwnerId(connection)

    if (health.ok) {
      return await connectionStateService.transition({
        connectionId: connection.id,
        event: "verify.ok",
        ownerId,
      })
    }
    if (health.revoked) {
      return await connectionStateService.markUnhealthy({
        connectionId: connection.id,
        reason: "token_revoked",
        ownerId,
      })
    }
    return await connectionStateService.transition({
      connectionId: connection.id,
      event: "verify.failed_non_auth",
      reason: "verify_failed",
      ownerId,
    })
  }

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
  async connectFromCredentials(input: {
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
  }): Promise<ConnectionModel> {
    const adapter = this.resolveAdapter(input.provider)
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
      Object.entries(input.config).filter(
        ([key]) => !configFieldNames.has(key),
      ),
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

    const ownerId = await this.resolveOwnerId({
      kind: provider.kind,
      workspaceId: input.workspaceId,
    })

    const connection = await db.transaction(async (tx) => {
      // Revive: for a `keep_row` provider (e.g. Telegram, which connects
      // via `connectFromCredentials`'s bot-token strategy) the satellite
      // row was never deleted on disconnect — calling `store.insertRow`
      // again would collide with its own unique constraint and get
      // miscategorized as `connectionAlreadyConnectedException` below,
      // silently blocking a legitimate revive. Update the kept row's auth
      // in place instead, the same primitive `reconnect`/
      // `completeReconnect`/`connectCandidate` already use for this edge.
      let integrationId: string | undefined
      if (existing && store.onDisconnect === "keep_row") {
        const existingForeignKey = resolveForeignKey(existing)
        if (existingForeignKey) {
          await store.saveAuthByForeignKey(existingForeignKey, auth, tx)
        }
        integrationId = existing.integrationId ?? undefined
      } else {
        try {
          const inserted = await store.insertRow(
            {
              workspaceId: input.workspaceId,
              auth,
              descriptor,
              config: extraConfig,
            },
            tx,
          )
          integrationId = inserted.integrationId
        } catch (err) {
          if (
            store.duplicateConstraint &&
            isUniqueViolationError(err, store.duplicateConstraint)
          ) {
            throw connectionAlreadyConnectedException()
          }
          throw err
        }
      }

      if (existing) {
        await connectionRepository.update(
          {
            id: existing.id,
            values: {
              integrationId: integrationId ?? null,
              displayName: descriptor.displayName,
              lastError: null,
              statusReason: null,
            },
          },
          tx,
        )
        return await connectionStateService.transition({
          connectionId: existing.id,
          event: "connect.completed",
          ownerId,
          tx,
        })
      }

      // Inserted `disconnected` (not `connected`) so the immediately
      // following `transition` crosses the inactive->active edge itself —
      // that is the only path `ConnectionStateService.transition` consumes
      // quota from. Hardcoding `status: "connected"` here would silently
      // skip quota consumption for any channel-kind provider connected via
      // this method (e.g. a future `token`-strategy channel).
      const created = await connectionRepository.insert(
        {
          workspaceId: input.workspaceId,
          provider: input.provider,
          kind: provider.kind,
          sourceId: descriptor.sourceId,
          displayName: descriptor.displayName,
          integrationId: integrationId ?? null,
          status: "disconnected",
          createdBy: input.actorUserId ?? null,
        },
        tx,
      )
      return await connectionStateService.transition({
        connectionId: created.id,
        event: "connect.completed",
        ownerId,
        tx,
      })
    })

    return await this.subscribeWebhookBestEffort({
      adapter,
      auth,
      connection,
      ownerId,
    })
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
  async startSession(input: {
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
  }): Promise<{ session: ConnectSessionModel; nextAction: ConnectNextAction }> {
    const adapter = this.resolveAdapter(input.provider)
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
  async completeAuthorization(input: {
    sessionId: string
    nonce: string
    code: string
    callbackUrl: string
    credential: ConnectionCredential
  }): Promise<ConnectSessionModel> {
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

    const adapter = this.resolveAdapter(session.provider)
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
      await connectSessionService.fail({
        id: session.id,
        errorCode: "provider_denied",
      })
      throw connectionCredentialsRejectedException(
        toPublicErrorMessage(err, "The provider rejected the authorization."),
      )
    }

    if (session.purpose === "reconnect" && session.targetConnectionId) {
      return await this.completeReconnect({ session, auth })
    }

    return await this.listAndAttachCandidates(session, auth)
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
  async listAndAttachCandidates(
    session: ConnectSessionModel,
    auth: AuthValue,
  ): Promise<ConnectSessionModel> {
    const adapter = this.resolveAdapter(session.provider)

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
   * Re-authorizes an existing (typically `needs_reauth`) `Connection` — a
   * `startSession` with `purpose: "reconnect"` and `targetConnectionId` set,
   * so `completeAuthorization` skips candidate selection entirely and
   * verifies the re-granted account's identity matches this exact
   * connection instead.
   */
  async reconnect(input: {
    connectionId: string
    workspaceId: string
    credential: ConnectionCredential
    callbackUrl: string
    actorUserId?: string | null
    actorTokenId?: string | null
    platformOwnerId?: string | null
    originHost?: string | null
    returnUrl?: string | null
  }): Promise<{ session: ConnectSessionModel; nextAction: ConnectNextAction }> {
    const connection = await this.findOrThrow({
      connectionId: input.connectionId,
      workspaceId: input.workspaceId,
    })
    return await this.startSession({
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

  /**
   * `completeAuthorization`'s reconnect path: verifies the freshly
   * re-authorized identity (`provider.describe(auth).sourceId`) matches the
   * target `Connection`'s own `sourceId` — a user can grant access to a
   * DIFFERENT account than the one being reconnected, which must not
   * silently overwrite the wrong connection's auth — then saves the new
   * auth and transitions the connection back to healthy.
   */
  private async completeReconnect(input: {
    session: ConnectSessionModel
    auth: AuthValue
  }): Promise<ConnectSessionModel> {
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

    const adapter = this.resolveAdapter(connection.provider)
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
    const ownerId = await this.resolveOwnerId(connection)
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
   * `instagramFacebook`'s satellite table is shared with `instagram`
   * (`IntegrationInstagram`, disambiguated by its `type` column — see
   * `CONNECTION_STORE_BINDINGS`), but `Inbox.channel` has no matching
   * `instagramFacebook` value (`ChannelType` only has `instagram`) — every
   * other channel-kind `IntegrationType` literal is already a valid
   * `ChannelType`. Only called for `kind === "channel"` providers.
   */
  private toChannelType(provider: IntegrationType): ChannelType {
    return provider === "instagramFacebook"
      ? "instagram"
      : (provider as ChannelType)
  }

  /**
   * Connects one already-authorized `ConnectionCandidate` — the per-target
   * unit of work behind `connectTargets`. Channel-kind candidates mint (or
   * revive) their `Inbox` row first via `inboxService.create`, since
   * `Connection.inboxId` must exist before `store.insertRow` and before
   * `connectionStateService.transition`'s own Inbox mirror can run;
   * `skipQuota: true` there is required — `transition`'s `applyQuotaEdge`
   * is the sole quota consumption point on this path (see `ConnectionService.connectFromCredentials`'s
   * revive-or-insert comment above), so also consuming inside
   * `inboxService.create` would charge a brand-new channel twice. Otherwise
   * mirrors `connectFromCredentials`'s revive-or-insert transaction body.
   *
   * Scope: a *bare* connect. The per-provider UI conveniences a
   * picker-driven connect layers on top (Messenger's persistent-menu
   * branding, workspace-logo push, tag-sync enqueue — see
   * `apps/builder/src/features/integration-messenger/actions/connect-page.ts`)
   * are NOT replicated here; `ConnectionProvider.actions` (reserved) is the
   * intended future home for a client to opt into any of those separately.
   */
  private async connectCandidate(input: {
    workspaceId: string
    provider: IntegrationType
    candidate: ConnectionCandidate
    actorUserId?: string | null
  }): Promise<ConnectionModel> {
    const adapter = this.resolveAdapter(input.provider)
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

    const ownerId = await this.resolveOwnerId({
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
            channel: this.toChannelType(input.provider),
            sourceId: descriptor.sourceId,
            name: descriptor.displayName,
          },
          ownerId,
          tx,
          skipQuota: true,
        })
        inboxId = inbox.id
      }

      // Revive: for a `keep_row` provider (tiktok/whatsapp/zalo/telegram/
      // webchat) the satellite row was never deleted on disconnect —
      // calling `store.insertRow` again would collide with its own unique
      // constraint and get miscategorized as `connectionAlreadyConnectedException`
      // below, silently blocking a legitimate revive. Update the kept row's
      // auth in place instead, the same primitive `reconnect`/
      // `completeReconnect` already use for this edge. A `delete_row`
      // provider's satellite row IS gone even when `existing` is set (the
      // Connection row outlives its satellite row across a disconnect), so
      // it still needs a fresh `insertRow`.
      let integrationId: string | undefined
      if (existing && store.onDisconnect === "keep_row") {
        const existingForeignKey = resolveForeignKey(existing)
        if (existingForeignKey) {
          await store.saveAuthByForeignKey(existingForeignKey, auth, tx)
        }
        integrationId = existing.integrationId ?? undefined
      } else {
        try {
          const inserted = await store.insertRow(
            {
              workspaceId: input.workspaceId,
              inboxId,
              auth,
              descriptor,
              config: extraConfig,
            },
            tx,
          )
          integrationId = inserted.integrationId
        } catch (err) {
          if (
            store.duplicateConstraint &&
            isUniqueViolationError(err, store.duplicateConstraint)
          ) {
            throw connectionAlreadyConnectedException()
          }
          throw err
        }
      }

      if (existing) {
        await connectionRepository.update(
          {
            id: existing.id,
            values: {
              inboxId: inboxId ?? existing.inboxId,
              integrationId: integrationId ?? null,
              displayName: descriptor.displayName,
              lastError: null,
              statusReason: null,
            },
          },
          tx,
        )
        return await connectionStateService.transition({
          connectionId: existing.id,
          event: "connect.completed",
          ownerId,
          tx,
        })
      }

      const created = await connectionRepository.insert(
        {
          workspaceId: input.workspaceId,
          provider: input.provider,
          kind: provider.kind,
          sourceId: descriptor.sourceId,
          displayName: descriptor.displayName,
          inboxId: inboxId ?? null,
          integrationId: integrationId ?? null,
          status: "disconnected",
          createdBy: input.actorUserId ?? null,
        },
        tx,
      )
      return await connectionStateService.transition({
        connectionId: created.id,
        event: "connect.completed",
        ownerId,
        tx,
      })
    })

    return await this.subscribeWebhookBestEffort({
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
  async connectTargets(input: {
    sessionId: string
    workspaceId: string
    targetIds: string[]
    actorUserId?: string | null
  }): Promise<{
    session: ConnectSessionModel
    connections: ConnectionModel[]
    outcomes: ConnectSessionOutcome[]
  }> {
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
        const connection = await this.connectCandidate({
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
}

export const connectionService = new ConnectionService()
