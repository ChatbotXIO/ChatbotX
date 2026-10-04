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

/** Exactly one of `actorUserId`/`actorTokenId` at creation time, surfacing a clean error before the insert rather than a raw constraint-violation one. Stricter than the DB's own `ConnectSession_actor_exactly_one` CHECK, which only enforces `<= 1` (0 or 1) — it has to tolerate an actor FK going null later via `ON DELETE SET NULL`, not just at creation. */
const requireExactlyOneActor = (input: {
  actorUserId?: string | null
  actorTokenId?: string | null
}): void => {
  const hasUser = Boolean(input.actorUserId)
  const hasToken = Boolean(input.actorTokenId)
  if (hasUser === hasToken) {
    throw new Error(
      "ConnectSession requires exactly one of actorUserId/actorTokenId",
    )
  }
}

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
  /** Mints a new session and its one-time plaintext nonce (never persisted — only its hash is). Throws `connectSessionLimitReached` past the per-workspace pending cap. */
  async create(input: {
    id?: string
    workspaceId: string
    provider: IntegrationType
    purpose: ConnectSessionPurpose
    nextAction?: (nonce: string) => ConnectSessionModel["nextAction"]
    targetConnectionId?: string | null
    actorUserId?: string | null
    actorTokenId?: string | null
    platformOwnerId?: string | null
    originHost?: string | null
    returnUrl?: string | null
  }): Promise<{ session: ConnectSessionModel; nonce: string }> {
    requireExactlyOneActor(input)

    const activeCount = await connectSessionRepository.countActiveByWorkspaceId(
      { workspaceId: input.workspaceId },
    )
    if (activeCount >= MAX_PENDING_SESSIONS_PER_WORKSPACE) {
      throw sessionLimitReachedException()
    }

    const nonce = toHex(randomBytes(NONCE_BYTES))
    const stateNonceHash = await hashNonce(nonce)
    const nextAction = input.nextAction?.(nonce) ?? null

    const session = await connectSessionRepository.insert({
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
      returnUrl: input.returnUrl ?? null,
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
      claimedTargetIds: [],
      resultConnectionIds: [],
      results: [],
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    })

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

  /**
   * Workspace-unscoped lookup by id alone — the `/connect/{id}` completion
   * page has no builder session (the person completing an API/MCP-started
   * OAuth connect is never necessarily logged into the builder, or even a
   * member of the workspace that started it). Safe to expose unscoped: the
   * id is an unguessable snowflake acting as its own capability token, and
   * the returned row's public projection (`ConnectSessionResource`) never
   * carries `encryptedAuth`/`stateNonceHash`/`claimedTargetIds`.
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
    const existing = await this.findById(input.id)
    if (!existing) {
      throw new ConnectSessionNotFoundException()
    }
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      workspaceId: existing.workspaceId,
      statuses: [...ACTIVE_STATUSES],
      values: { returnUrl: input.returnUrl },
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
   * Guarded by `updateWhereActive` (status + unexpired) in the SAME
   * statement as the write — not a `requireActive` read followed by a
   * separate `update` — so a cancel/expire that lands during the OAuth
   * provider's `exchangeCode` round trip can never be "revived" back into
   * `awaiting_selection` by this call landing after it.
   */
  async attachAuthorization(input: {
    id: string
    workspaceId?: string
    encryptedAuth: EncryptedData
    targets: ConnectSessionTarget[]
  }): Promise<ConnectSessionModel> {
    const existing = input.workspaceId
      ? undefined
      : await this.findById(input.id)
    const workspaceId = input.workspaceId ?? existing?.workspaceId
    if (!workspaceId) {
      throw new ConnectSessionNotFoundException()
    }
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      workspaceId,
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
   * Atomic per-target claim — the compare-and-set that makes concurrent
   * `connectTargets` calls (a double-submit, or two tabs) safe. Returns
   * `false` when the target was already claimed by a prior call on this
   * session; the caller maps that to a `duplicated` outcome rather than
   * connecting the same target twice.
   */
  async claimTarget(input: {
    id: string
    workspaceId?: string
    targetId: string
  }): Promise<boolean> {
    if (input.workspaceId) {
      return await connectSessionRepository.claimTarget({
        ...input,
        workspaceId: input.workspaceId,
      })
    }
    const session = await this.findById(input.id)
    if (!session) {
      return false
    }
    return await connectSessionRepository.claimTarget({
      ...input,
      workspaceId: session.workspaceId,
    })
  }

  /**
   * Atomically merges one `connectTargets` batch's outcomes into the
   * session's running totals via `connectSessionRepository.appendResults`
   * — a single guarded SQL `UPDATE`, not a read-then-write (which lost
   * updates under two concurrent batches on the same session). Completion
   * is computed over DISTINCT target ids against the session's own
   * selectable-target count, so a `notSelectable` target or a duplicated
   * outcome can't skew it; the terminal status is `completed` only if at
   * least one outcome succeeded, otherwise `failed` — an all-`failed`/
   * all-`limitReached` batch no longer reports success. Guarded by
   * `status = 'awaiting_selection'`: a session already terminal (a
   * concurrent batch completed it first, or it was `fail`/`cancel`led)
   * updates 0 rows — this returns that current terminal row unchanged
   * instead of throwing, so a caller that merely raced another terminal
   * transition sees the real outcome rather than a spurious error.
   */
  async recordResults(input: {
    id: string
    workspaceId?: string
    results: ConnectSessionOutcome[]
    resultConnectionIds: string[]
  }): Promise<ConnectSessionModel> {
    const existing = input.workspaceId
      ? undefined
      : await this.findById(input.id)
    const workspaceId = input.workspaceId ?? existing?.workspaceId
    if (!workspaceId) {
      throw new ConnectSessionNotFoundException()
    }
    const updated = await connectSessionRepository.appendResults({
      ...input,
      workspaceId,
    })
    if (updated) {
      return updated
    }
    if (existing) {
      return existing
    }
    const current = await this.findByIdForWorkspace({
      id: input.id,
      workspaceId,
    })
    if (!current) {
      throw new ConnectSessionNotFoundException()
    }
    return current
  }

  /** Releases a target `claimTarget` claimed whose `connectTargets` attempt did not end in `connected` — see `connectSessionRepository.releaseTarget`. */
  async releaseTarget(input: {
    id: string
    workspaceId?: string
    targetId: string
  }): Promise<void> {
    if (input.workspaceId) {
      await connectSessionRepository.releaseTarget({
        ...input,
        workspaceId: input.workspaceId,
      })
      return
    }
    const session = await this.findById(input.id)
    if (!session) {
      return
    }
    await connectSessionRepository.releaseTarget({
      ...input,
      workspaceId: session.workspaceId,
    })
  }

  /** Completes the single target represented by an OAuth reconnect session. */
  async completeReconnect(input: {
    id: string
    workspaceId?: string
    result: ConnectSessionOutcome & { connectionId: string }
  }): Promise<ConnectSessionModel> {
    const existing = input.workspaceId
      ? undefined
      : await this.findById(input.id)
    const workspaceId = input.workspaceId ?? existing?.workspaceId
    if (!workspaceId) {
      throw new ConnectSessionNotFoundException()
    }
    const updated = await connectSessionRepository.completeReconnect({
      id: input.id,
      workspaceId,
      result: input.result,
    })
    if (updated) {
      return updated
    }
    if (existing) {
      return existing
    }
    const current = await this.findByIdForWorkspace({
      id: input.id,
      workspaceId,
    })
    if (!current) {
      throw new ConnectSessionNotFoundException()
    }
    return current
  }

  /**
   * Records user-submitted `enter_input` step data (e.g. a credential-
   * strategy `config`) without changing status — the caller advances the
   * step separately once it has processed the input. Guarded by
   * `updateWhereActive` in the same statement as the write (see
   * `attachAuthorization`) rather than a `requireActive` read followed by a
   * separate `update`.
   */
  async submitInput(input: {
    id: string
    workspaceId?: string
    nextAction: ConnectSessionModel["nextAction"]
  }): Promise<ConnectSessionModel> {
    const existing = input.workspaceId
      ? undefined
      : await this.findById(input.id)
    const workspaceId = input.workspaceId ?? existing?.workspaceId
    if (!workspaceId) {
      throw new ConnectSessionNotFoundException()
    }
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      workspaceId,
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

  /** Transitions to `failed`, guarded to only affect an active (non-terminal) session — a replayed/duplicate OAuth callback `?error=` can never flip an already-`completed`/`cancelled`/etc. session. Returns the session's current (already-terminal) row unchanged instead of throwing when the guard doesn't match. */
  async fail(input: {
    id: string
    workspaceId?: string
    errorCode: ConnectSessionErrorCode
  }): Promise<ConnectSessionModel> {
    const existing = input.workspaceId
      ? undefined
      : await this.findById(input.id)
    const workspaceId = input.workspaceId ?? existing?.workspaceId
    if (!workspaceId) {
      throw new ConnectSessionNotFoundException()
    }
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      workspaceId,
      statuses: [...ACTIVE_STATUSES],
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
    if (existing) {
      return existing
    }
    const current = await this.findByIdForWorkspace({
      id: input.id,
      workspaceId,
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
    const { deleted: deletedTerminal, stopReason: terminalPurgeStopReason } =
      await connectSessionRepository.purgeOldTerminal(options)
    return { expired, deletedTerminal, terminalPurgeStopReason }
  }

  /**
   * `expiresAt <= now()` reads as `expired` regardless of the stored status
   * — lazily flips the row so every reader agrees without a cron
   * dependency. Guarded by `updateWhereStatusIn` (same as `fail`/`cancel`)
   * so a concurrent completion racing this read can't be overwritten, and
   * clears `consumedAt`/`encryptedAuth` like every other terminal
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
