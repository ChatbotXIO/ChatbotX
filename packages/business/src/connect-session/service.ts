import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type {
  ConnectSessionErrorCode,
  ConnectSessionOutcome,
  ConnectSessionPurpose,
  ConnectSessionStatus,
  ConnectSessionTarget,
  IntegrationType,
} from "@chatbotx.io/database/partials"
import { connectSessionRepository } from "@chatbotx.io/database/repositories"
import type { ConnectSessionModel } from "@chatbotx.io/database/types"
import type { EncryptedData } from "@chatbotx.io/encryption"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, connectSessionExpiredException } from "../errors"

/** 10 min to complete the OAuth/credential round trip before the session goes stale. */
const PENDING_TTL_MS = 10 * 60 * 1000
/** 30 min from authorization to finish target selection once the provider has granted access. */
const AUTHORIZED_TTL_MS = 30 * 60 * 1000
const NONCE_BYTES = 32
/** Caps concurrent in-flight sessions per workspace — a runaway client retrying `create` cannot exhaust the table. */
const MAX_PENDING_SESSIONS_PER_WORKSPACE = 20
/** A target connect attempt has five minutes to finish before another request may take over. */
const TARGET_CLAIM_LEASE_MS = 5 * 60 * 1000

const ACTIVE_STATUSES: ReadonlySet<ConnectSessionStatus> = new Set([
  "pending",
  "authorized",
  "awaiting_selection",
] satisfies ConnectSessionStatus[])

const randomBytes = (length: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(length))

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

/** Web Crypto only — safe in both Node and edge runtimes, same primitive as `workspace-api-token/credentials.ts#hashToken`. */
const hashNonce = async (nonce: string): Promise<string> => {
  const data = new TextEncoder().encode(nonce)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return toHex(new Uint8Array(digest))
}

class ConnectSessionNotFoundException extends ChatbotXException {
  constructor() {
    super("Connect session not found.", "notFound", 404)
  }
}

const sessionLimitReachedException = () =>
  new ChatbotXException(
    "Too many pending connect sessions for this workspace. Complete or cancel an existing one first.",
    "connectSessionLimitReached",
    429,
  )

const containsControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })

/**
 * True for an application-relative path that cannot be re-interpreted as an
 * absolute or protocol-relative URL: a single leading `/`, no backslash, no
 * control characters. Applied to the input and to the normalized result.
 */
const isSafeRelativePath = (value: string): boolean =>
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.includes("\\") &&
  !containsControlCharacter(value)

const validateReturnUrl = (
  returnUrl: string | null | undefined,
): string | null => {
  if (!returnUrl) {
    return null
  }
  if (!isSafeRelativePath(returnUrl)) {
    throw new ChatbotXException(
      "Connect session return URL must be an application-relative path.",
      "validation",
      400,
    )
  }
  const url = new URL(returnUrl, "http://x.invalid")
  if (url.origin !== "http://x.invalid") {
    throw new ChatbotXException(
      "Connect session return URL must be an application-relative path.",
      "validation",
      400,
    )
  }
  const normalized = `${url.pathname}${url.search}${url.hash}`
  // Dot-segment collapsing can turn `/..//evil.com` into `//evil.com`.
  if (!isSafeRelativePath(normalized)) {
    throw new ChatbotXException(
      "Connect session return URL must be an application-relative path.",
      "validation",
      400,
    )
  }
  return normalized
}

/** A `ConnectSession` always runs as either a builder-session user or a workspace-token caller — never both, never neither. Enforced at the type level so a caller can no longer reach the database's `ConnectSession_actor_at_most_one` CHECK (which only enforces `<= 1`, since an actor FK may later become null through `ON DELETE SET NULL`) with an invalid pair. */
export type ConnectSessionActor =
  | { actorUserId: string; actorTokenId?: never }
  | { actorTokenId: string; actorUserId?: never }

/**
 * DB-backed reads/writes over the `ConnectSession` table — the multi-step
 * OAuth/credential connect flow record (Home Assistant config-flow /
 * Nango-connect-session shaped: a `nextAction` field the client renders,
 * advanced by server-driven steps rather than a client-owned state machine).
 *
 * Deliberately **registry-free**, mirroring `connectionStateService`: it
 * never imports `@chatbotx.io/connections`, so it stays safe to call from
 * the OAuth callback hub and the completion page's private API without
 * pulling in the full provider registry. The registry-aware orchestration
 * (provider `authorizeUrl`/`exchangeCode`/`listCandidates`/`connect` calls)
 * lives in `ConnectionService.startSession`/`completeAuthorization`/
 * `connectTargets` (`@chatbotx.io/connections`), which call this service for
 * every state read/write.
 */
class ConnectSessionService extends BaseService {
  /**
   * Mints a new session and its one-time plaintext nonce (never persisted —
   * only its hash is). Throws `connectSessionLimitReached` past the
   * per-workspace pending cap.
   *
   * Accepts an optional `tx` so a caller that must mint the session's
   * workspace in the same breath (`startSession`'s `createWorkspace` path —
   * a cancelled/failed first-channel connect must not leave an empty
   * workspace behind) can run both inserts atomically: either the whole
   * transaction commits, or neither row exists.
   */
  async create(
    input: {
      id?: string
      workspaceId: string
      provider: IntegrationType
      purpose: ConnectSessionPurpose
      nextAction?: (nonce: string) => ConnectSessionModel["nextAction"]
      targetConnectionId?: string | null
      platformOwnerId?: string | null
      originHost?: string | null
      returnUrl?: string | null
    } & ConnectSessionActor,
    tx: DatabaseClient = db,
  ): Promise<{ session: ConnectSessionModel; nonce: string }> {
    const activeCount = await connectSessionRepository.countActiveByWorkspaceId(
      { workspaceId: input.workspaceId },
      tx,
    )
    if (activeCount >= MAX_PENDING_SESSIONS_PER_WORKSPACE) {
      throw sessionLimitReachedException()
    }

    const nonce = toHex(randomBytes(NONCE_BYTES))
    const stateNonceHash = await hashNonce(nonce)
    const nextAction = input.nextAction?.(nonce) ?? null
    const returnUrl = validateReturnUrl(input.returnUrl)

    const session = await connectSessionRepository.insert(
      {
        id: input.id ?? createId(),
        workspaceId: input.workspaceId,
        provider: input.provider,
        purpose: input.purpose,
        nextAction,
        targetConnectionId: input.targetConnectionId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorTokenId: input.actorTokenId ?? null,
        platformOwnerId: input.platformOwnerId ?? null,
        originHost: input.originHost ?? null,
        returnUrl,
        stateNonceHash,
        status: "pending",
        step: "authorize",
        // The schema declares `.default(sql\`[]\`)` for these four columns, but
        // drizzle-kit never inlines a `sql` default into the generated
        // migration (see `schema-default-parity.test.ts`) — the physical
        // columns have NO database default, so omitting any of these turns
        // into a bare `DEFAULT` keyword and a NOT NULL violation. Every insert
        // must write them explicitly.
        targets: [],
        targetClaims: {},
        resultConnectionIds: [],
        results: [],
        expiresAt: new Date(Date.now() + PENDING_TTL_MS),
      },
      tx,
    )

    return { session, nonce }
  }

  /** Resolves a session by its plaintext OAuth `state` nonce — the only lookup the callback hub can do before it knows a workspace. Applies the `expiresAt` rule before returning. */
  async findByNonce(nonce: string): Promise<ConnectSessionModel | undefined> {
    const stateNonceHash = await hashNonce(nonce)
    const session = await connectSessionRepository.findByStateNonceHash({
      stateNonceHash,
    })
    return await this.applyExpiryRule(session)
  }

  async findByIdForWorkspace(input: {
    id: string
    workspaceId: string
  }): Promise<ConnectSessionModel | undefined> {
    const session = await connectSessionRepository.findByIdForWorkspace(input)
    return await this.applyExpiryRule(session)
  }

  /** The workspace's newest unexpired in-flight session of a provider — lets a settings page resume a connect after the OAuth round-trip. */
  async findLatestInFlightByProvider(input: {
    workspaceId: string
    provider: IntegrationType
  }): Promise<ConnectSessionModel | undefined> {
    return await connectSessionRepository.findLatestInFlightByProvider(input)
  }

  /**
   * Workspace-unscoped lookup by id alone for the `/connect/{id}` completion
   * page. The time-ordered snowflake id is an identifier, not a capability
   * token; callers must authorize mutations with workspace scope or the OAuth
   * state nonce.
   */
  async findById(id: string): Promise<ConnectSessionModel | undefined> {
    const session = await connectSessionRepository.findById({ id })
    return await this.applyExpiryRule(session)
  }

  /** Same as `findByIdForWorkspace`, throwing instead of returning `undefined` — the shape most callers actually want. */
  async requireByIdForWorkspace(input: {
    id: string
    workspaceId: string
  }): Promise<ConnectSessionModel> {
    const session = await this.findByIdForWorkspace(input)
    if (!session) {
      throw new ConnectSessionNotFoundException()
    }
    return session
  }

  /**
   * Sets `returnUrl` on an already-created session — for a caller (a
   * builder picker's OAuth-initiating route) that needs the redirect target
   * to reference the session's own id (`?session={id}`), which isn't known
   * until after `create()` returns. Guarded the same as
   * `attachAuthorization`/`submitInput` (active status + unexpired) for
   * consistency — in practice this call races nothing (the OAuth dialog
   * hasn't been visited yet), but it must not silently write to a session a
   * concurrent request already cancelled/expired/completed.
   */
  async updateReturnUrl(input: {
    id: string
    returnUrl: string
  }): Promise<ConnectSessionModel> {
    const returnUrl = validateReturnUrl(input.returnUrl)
    const existing = await this.findById(input.id)
    if (!existing) {
      throw new ConnectSessionNotFoundException()
    }
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      workspaceId: existing.workspaceId,
      statuses: [...ACTIVE_STATUSES],
      values: { returnUrl },
      requireUnexpired: true,
    })
    if (!updated) {
      throw new ConnectSessionNotFoundException()
    }
    return updated
  }

  /**
   * Persists the exchanged auth and the provider's candidate list, moving
   * the session to `awaiting_selection`. The caller (registry-aware
   * `ConnectionService.completeAuthorization`) decides whether to
   * immediately follow with `connectTargets` for a single-target/
   * non-multi-account provider — this method itself makes no registry-aware
   * decision, it only records the step.
   *
   * Guarded by `updateWhereStatusIn` (status + unexpired) in the SAME
   * statement as the write — not a `requireActive` read followed by a
   * separate `update` — so a cancel/expire that lands during the OAuth
   * provider's `exchangeCode` round trip can never be "revived" back into
   * `awaiting_selection` by this call landing after it.
   */
  async attachAuthorization(input: {
    id: string
    workspaceId: string
    encryptedAuth: EncryptedData
    targets: ConnectSessionTarget[]
  }): Promise<ConnectSessionModel> {
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      workspaceId: input.workspaceId,
      statuses: [...ACTIVE_STATUSES],
      requireUnexpired: true,
      values: {
        status: "awaiting_selection",
        step: "select",
        encryptedAuth: input.encryptedAuth,
        targets: input.targets,
        expiresAt: new Date(Date.now() + AUTHORIZED_TTL_MS),
      },
    })
    if (updated) {
      return updated
    }
    throw connectSessionExpiredException(
      "This connect session is no longer active.",
    )
  }

  /**
   * Atomically claims an OAuth callback before its single-use authorization
   * code is exchanged. `authorized` is an existing transient active status:
   * only the caller that moves `pending` to it may continue to attach auth.
   */
  async claimAuthorization(input: {
    id: string
    workspaceId: string
  }): Promise<ConnectSessionModel> {
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      workspaceId: input.workspaceId,
      statuses: ["pending"],
      requireUnexpired: true,
      values: { status: "authorized" },
    })
    if (updated) {
      return updated
    }
    throw connectSessionExpiredException(
      "This connect session is no longer active.",
    )
  }

  /**
   * Atomically claims one target with a lease. A caller may take over only a
   * claim whose lease has expired.
   */
  async claimTarget(input: {
    id: string
    workspaceId: string
    targetId: string
    ownerToken: string
  }): Promise<boolean> {
    return await connectSessionRepository.claimTarget({
      ...input,
      leaseExpiresAt: new Date(Date.now() + TARGET_CLAIM_LEASE_MS),
    })
  }

  /**
   * Atomically merges one `connectTargets` batch's outcomes into the
   * session's running totals via `connectSessionRepository.appendResults`
   * — a single guarded SQL `UPDATE`, not a read-then-write (which lost
   * updates under concurrent batches). Completion requires every selectable
   * target to resolve as `connected` or `duplicated`; `failed` and
   * `limitReached` outcomes remain retryable. The merge requires
   * `expiresAt > now()` and an `awaiting_selection` status; a concurrent
   * terminal transition updates zero rows and returns the current terminal
   * session unchanged.
   */
  async recordResults(input: {
    id: string
    workspaceId: string
    results: ConnectSessionOutcome[]
    resultConnectionIds: string[]
  }): Promise<ConnectSessionModel> {
    const updated = await connectSessionRepository.appendResults(input)
    if (updated) {
      return updated
    }
    const current = await this.findByIdForWorkspace({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!current) {
      throw new ConnectSessionNotFoundException()
    }
    return current
  }

  /**
   * Finishes an `awaiting_selection` session once the caller has connected
   * everything it wants, even though other selectable targets are unresolved.
   * `recordResults` only completes when EVERY selectable target resolves, which
   * never happens for a provider limited to one connection per workspace (a
   * second pick would fail), so such a caller closes the session here. Clears
   * `encryptedAuth` so the remaining candidates' tokens do not linger. Guarded
   * to `awaiting_selection` in the same statement; an already-terminal session
   * is returned unchanged.
   */
  async completeSelection(input: {
    id: string
    workspaceId: string
  }): Promise<ConnectSessionModel> {
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      workspaceId: input.workspaceId,
      statuses: ["awaiting_selection"],
      values: {
        status: "completed",
        step: "done",
        consumedAt: new Date(),
        encryptedAuth: null,
      },
    })
    if (updated) {
      return updated
    }
    return await this.requireByIdForWorkspace(input)
  }

  /** Releases only this attempt's target lease after a failed connection. */
  async releaseTarget(input: {
    id: string
    workspaceId: string
    targetId: string
    ownerToken: string
  }): Promise<void> {
    await connectSessionRepository.releaseTarget(input)
  }

  /** Completes the single target represented by an OAuth reconnect session. */
  async completeReconnect(input: {
    id: string
    workspaceId: string
    tx: DatabaseClient
    result: ConnectSessionOutcome & { connectionId: string }
  }): Promise<ConnectSessionModel> {
    const updated = await connectSessionRepository.completeReconnect(
      {
        id: input.id,
        workspaceId: input.workspaceId,
        result: input.result,
      },
      input.tx,
    )
    if (updated) {
      return updated
    }
    throw connectSessionExpiredException(
      "This connect session is no longer active.",
    )
  }

  /** Returns an OAuth callback claim to `pending` before any authorization has been persisted. */
  async releaseAuthorization(input: {
    id: string
    workspaceId: string
  }): Promise<void> {
    await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      workspaceId: input.workspaceId,
      statuses: ["authorized"],
      values: { status: "pending" },
      requireUnexpired: true,
    })
  }

  /** Durably stores exchanged OAuth auth while candidate discovery remains retryable. */
  async storeAuthorization(input: {
    id: string
    workspaceId: string
    encryptedAuth: EncryptedData
  }): Promise<ConnectSessionModel> {
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      workspaceId: input.workspaceId,
      statuses: ["authorized"],
      values: {
        encryptedAuth: input.encryptedAuth,
        expiresAt: new Date(Date.now() + AUTHORIZED_TTL_MS),
      },
      requireUnexpired: true,
    })
    if (updated) {
      return updated
    }
    throw connectSessionExpiredException(
      "This connect session is no longer active.",
    )
  }

  /**
   * Records user-submitted `enter_input` step data (e.g. a credential-
   * strategy `config`) without changing status — the caller advances the
   * step separately once it has processed the input. Guarded by
   * `updateWhereStatusIn` in the same statement as the write (see
   * `attachAuthorization`) rather than a `requireActive` read followed by a
   * separate `update`.
   */
  async submitInput(input: {
    id: string
    workspaceId: string
    nextAction: ConnectSessionModel["nextAction"]
  }): Promise<ConnectSessionModel> {
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      workspaceId: input.workspaceId,
      statuses: [...ACTIVE_STATUSES],
      values: { nextAction: input.nextAction },
      requireUnexpired: true,
    })
    if (updated) {
      return updated
    }
    throw connectSessionExpiredException(
      "This connect session is no longer active.",
    )
  }

  /** Transitions to `failed`, guarded to only affect the supplied active statuses. A replayed OAuth callback can restrict this to `pending` so its exchange failure cannot overwrite a session that another callback already advanced. */
  async fail(input: {
    id: string
    workspaceId: string
    errorCode: ConnectSessionErrorCode
    statuses?: ConnectSessionStatus[]
  }): Promise<ConnectSessionModel> {
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      workspaceId: input.workspaceId,
      statuses: input.statuses ?? [...ACTIVE_STATUSES],
      values: {
        status: "failed",
        errorCode: input.errorCode,
        consumedAt: new Date(),
        encryptedAuth: null,
      },
    })
    if (updated) {
      return updated
    }
    const current = await this.findByIdForWorkspace({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!current) {
      throw new ConnectSessionNotFoundException()
    }
    return current
  }

  /** Transitions to `cancelled`, guarded to only affect an active session — see `fail`. */
  async cancel(input: {
    id: string
    workspaceId: string
  }): Promise<ConnectSessionModel> {
    const existing = await this.requireByIdForWorkspace(input)
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: existing.id,
      workspaceId: existing.workspaceId,
      statuses: [...ACTIVE_STATUSES],
      values: {
        status: "cancelled",
        consumedAt: new Date(),
        encryptedAuth: null,
      },
    })
    return updated ?? existing
  }

  /**
   * Cancels the workspace's abandoned `pending` sessions of a provider (an
   * OAuth attempt that never reached the callback) so they stop counting
   * toward the per-workspace cap. Leaves `authorized` / `awaiting_selection`
   * sessions untouched. Returns how many were cancelled.
   */
  async cancelPendingByProvider(input: {
    workspaceId: string
    provider: IntegrationType
  }): Promise<number> {
    return await connectSessionRepository.cancelPendingByProvider(input)
  }

  /**
   * The `purgeExpiredConnectSessions` cron's two sweeps:
   * - `expireDue`: one bulk `UPDATE` flips every active session past
   *   `expiresAt` to `expired` (not a per-row loop — see the repository
   *   method's docstring) and clears `encryptedAuth`.
   * - `purgeOldTerminal`: deletes terminal rows (already `completed`/
   *   `failed`/`expired`/`cancelled`) past `options.retentionDays` —
   *   without this, a finished `ConnectSession` row is never deleted, only
   *   ever flipped to a terminal status once.
   */
  async purgeExpired(options: {
    retentionDays: number
    chunkSize: number
    interChunkDelayMs: number
    maxChunks: number
    maxRunDurationMs?: number
  }): Promise<{
    expired: number
    deletedTerminal: number
    terminalPurgeStopReason: "drained" | "deadline" | "chunkCap"
  }> {
    const expired = await connectSessionRepository.expireDue({
      before: new Date(),
      statuses: [...ACTIVE_STATUSES],
    })
    const terminalPurge =
      await connectSessionRepository.purgeOldTerminal(options)
    return {
      expired,
      deletedTerminal: terminalPurge.deleted,
      terminalPurgeStopReason: terminalPurge.stopReason,
    }
  }

  /**
   * `expiresAt <= now()` reads as `expired` regardless of the stored status
   * — lazily flips the row so every reader agrees without a cron
   * dependency. Guarded by `updateWhereStatusIn` (same as `fail`/`cancel`)
   * so a concurrent completion racing this read can't be overwritten, and
   * sets `consumedAt` and clears `encryptedAuth` like every other terminal
   * transition — without that, `expireDue`'s cron sweep never selects the
   * row (it is no longer in an active status) and `purgeOldTerminal`
   * never selects it either (it only scans `consumedAt IS NOT NULL`), so
   * the row — and its ciphertext — would sit forever instead of being
   * swept.
   */
  private async applyExpiryRule(
    session: ConnectSessionModel | undefined,
  ): Promise<ConnectSessionModel | undefined> {
    if (!session) {
      return
    }
    if (session.expiresAt.getTime() > Date.now()) {
      return session
    }
    if (!ACTIVE_STATUSES.has(session.status)) {
      return session
    }
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: session.id,
      workspaceId: session.workspaceId,
      statuses: [...ACTIVE_STATUSES],
      values: {
        status: "expired",
        consumedAt: new Date(),
        encryptedAuth: null,
      },
    })
    if (updated) {
      return updated
    }
    return await connectSessionRepository.findById({ id: session.id })
  }
}

export const connectSessionService = new ConnectSessionService()
