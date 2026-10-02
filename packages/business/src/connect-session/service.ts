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

export class ConnectSessionNotFoundException extends ChatbotXException {
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

/** Exactly one of `actorUserId`/`actorTokenId` — mirrors the `ConnectSession_actor_exactly_one` DB CHECK constraint so a violation surfaces before the insert, not as a raw constraint-violation error. */
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
    workspaceId: string
    provider: IntegrationType
    purpose: ConnectSessionPurpose
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

    const session = await connectSessionRepository.insert({
      workspaceId: input.workspaceId,
      provider: input.provider,
      purpose: input.purpose,
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
   * until after `create()` returns. Best-effort by design at the call site:
   * the OAuth dialog hasn't been visited yet when this runs, so there is no
   * risk of a lost update racing a completed authorization.
   */
  async updateReturnUrl(input: {
    id: string
    returnUrl: string
  }): Promise<ConnectSessionModel> {
    const updated = await connectSessionRepository.update({
      id: input.id,
      values: { returnUrl: input.returnUrl },
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
   */
  async attachAuthorization(input: {
    id: string
    encryptedAuth: EncryptedData
    targets: ConnectSessionTarget[]
  }): Promise<ConnectSessionModel> {
    const existing = await this.requireActive(input.id)
    const updated = await connectSessionRepository.update({
      id: existing.id,
      values: {
        status: "awaiting_selection",
        step: "select",
        encryptedAuth: input.encryptedAuth,
        targets: input.targets,
        expiresAt: new Date(Date.now() + AUTHORIZED_TTL_MS),
      },
    })
    if (!updated) {
      throw new ConnectSessionNotFoundException()
    }
    return updated
  }

  /**
   * Atomic per-target claim — the compare-and-set that makes concurrent
   * `connectTargets` calls (a double-submit, or two tabs) safe. Returns
   * `false` when the target was already claimed by a prior call on this
   * session; the caller maps that to a `duplicated` outcome rather than
   * connecting the same target twice.
   */
  async claimTarget(input: { id: string; targetId: string }): Promise<boolean> {
    return await connectSessionRepository.claimTarget(input)
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
    results: ConnectSessionOutcome[]
    resultConnectionIds: string[]
  }): Promise<ConnectSessionModel> {
    const updated = await connectSessionRepository.appendResults(input)
    if (updated) {
      return updated
    }
    const existing = await connectSessionRepository.findById({ id: input.id })
    if (!existing) {
      throw new ConnectSessionNotFoundException()
    }
    return existing
  }

  /** Releases a target `claimTarget` claimed whose `connectTargets` attempt did not end in `connected` — see `connectSessionRepository.releaseTarget`. */
  async releaseTarget(input: { id: string; targetId: string }): Promise<void> {
    await connectSessionRepository.releaseTarget(input)
  }

  /** Records user-submitted `enter_input` step data (e.g. a credential-strategy `config`) without changing status — the caller advances the step separately once it has processed the input. */
  async submitInput(input: {
    id: string
    nextAction: ConnectSessionModel["nextAction"]
  }): Promise<ConnectSessionModel> {
    await this.requireActive(input.id)
    const updated = await connectSessionRepository.update({
      id: input.id,
      values: { nextAction: input.nextAction },
    })
    if (!updated) {
      throw new ConnectSessionNotFoundException()
    }
    return updated
  }

  /** Transitions to `failed`, guarded to only affect an active (non-terminal) session — a replayed/duplicate OAuth callback `?error=` can never flip an already-`completed`/`cancelled`/etc. session. Returns the session's current (already-terminal) row unchanged instead of throwing when the guard doesn't match. */
  async fail(input: {
    id: string
    errorCode: ConnectSessionErrorCode
  }): Promise<ConnectSessionModel> {
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: input.id,
      statuses: [...ACTIVE_STATUSES],
      values: {
        status: "failed",
        errorCode: input.errorCode,
        consumedAt: new Date(),
        // No further use once terminal — see `expireDue`/`cancel`/
        // `appendResults`, the other three terminal paths that clear it.
        encryptedAuth: null,
      },
    })
    if (updated) {
      return updated
    }
    const existing = await connectSessionRepository.findById({ id: input.id })
    if (!existing) {
      throw new ConnectSessionNotFoundException()
    }
    return existing
  }

  /** Transitions to `cancelled`, guarded to only affect an active session — see `fail`. */
  async cancel(input: {
    id: string
    workspaceId: string
  }): Promise<ConnectSessionModel> {
    const existing = await this.requireByIdForWorkspace(input)
    const updated = await connectSessionRepository.updateWhereStatusIn({
      id: existing.id,
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

  /** Loads an active (non-expired, non-terminal) session by id alone, or throws `connectSessionExpired`. */
  private async requireActive(id: string): Promise<ConnectSessionModel> {
    const session = await connectSessionRepository.findById({ id })
    const row = await this.applyExpiryRule(session)
    if (!row) {
      throw new ConnectSessionNotFoundException()
    }
    if (!ACTIVE_STATUSES.has(row.status)) {
      throw connectSessionExpiredException(
        "This connect session is no longer active.",
      )
    }
    return row
  }

  /** `expiresAt <= now()` reads as `expired` regardless of the stored status — lazily flips the row so every reader agrees without a cron dependency. */
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
    const updated = await connectSessionRepository.update({
      id: session.id,
      values: { status: "expired" },
    })
    return updated ?? session
  }
}

export const connectSessionService = new ConnectSessionService()
