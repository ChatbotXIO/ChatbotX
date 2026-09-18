import { alias } from "drizzle-orm/pg-core"
import {
  and,
  type DatabaseClient,
  DrizzleQueryError,
  db,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from "../../client"
import {
  resolveWhatsappCallOutcome,
  type WhatsappCallAiSummary,
  type WhatsappCallDirection,
  type WhatsappCallOutcome,
  type WhatsappCallStatus,
  type WhatsappCallTerminalStatus,
  type WhatsappCallTerminalStatusOutcomePair,
  type WhatsappCallTranscriptSegments,
} from "../../partials/whatsapp-call"
import {
  contactInboxModel,
  contactModel,
  conversationModel,
  inboxModel,
  integrationWhatsappModel,
  userModel,
  whatsappCallModel,
} from "../../schema"

type WhatsappCallRow = typeof whatsappCallModel.$inferSelect

/**
 * Terminal columns a same-status redelivery may fill; each gets its own `IS
 * NULL` guard (see `fillMissingTerminalFields`).
 */
const FILLABLE_TERMINAL_FIELDS = [
  "endedAt",
  "startedAt",
  "durationSeconds",
  "messageId",
  "lastError",
  "outcome",
] as const satisfies readonly (keyof WhatsappCallRow)[]

type WhatsappCallUpsertInput = {
  wacid: string
  direction: WhatsappCallDirection
  /**
   * Only a freshly announced call is inserted here, so terminal statuses are
   * excluded — a terminal insert would bypass the status/outcome pairing.
   */
  status: Exclude<WhatsappCallStatus, WhatsappCallTerminalStatus>
  workspaceId: string
  inboxId: string
  contactInboxId: string
  conversationId: string
  startedAt?: Date | null
  endedAt?: Date | null
  durationSeconds?: number | null
}

/**
 * Resume-after-refresh only expects a handful of ringing calls; the bound keeps
 * the scan and the follow-up Redis reads cheap.
 */
const FIND_RINGING_BY_WORKSPACE_LIMIT = 20

/**
 * Fields `attachWacid` moves onto the surviving row when merging, where the
 * survivor has none.
 */
const mergeOntoOlderRow = (
  older: WhatsappCallRow,
  newer: WhatsappCallRow,
): Pick<
  WhatsappCallRow,
  | "attemptId"
  | "recordingPath"
  | "recordedAt"
  | "transcript"
  | "transcribedAt"
  | "transcriptSegments"
> => ({
  attemptId: older.attemptId ?? newer.attemptId,
  recordingPath: older.recordingPath ?? newer.recordingPath,
  recordedAt: older.recordedAt ?? newer.recordedAt,
  transcript: older.transcript ?? newer.transcript,
  transcribedAt: older.transcribedAt ?? newer.transcribedAt,
  transcriptSegments: older.transcriptSegments ?? newer.transcriptSegments,
})

/**
 * Status may only advance in rank, since webhook and signaling jobs run
 * concurrently and a late RINGING/ACCEPTED can follow the terminate. Exception:
 * `rejected` may overwrite `failed` — a declined call terminates as FAILED and
 * its REJECTED status can arrive afterwards. `completed` is top and never
 * downgraded.
 */
const STATUS_RANK: Record<WhatsappCallStatus, number> = {
  ringing: 0,
  accepted: 1,
  rejected: 2,
  failed: 3,
  completed: 4,
}

/**
 * Persisted terminal statuses — never resurrected into `accepted`. `missed` is
 * UI-derived, never stored.
 */
export const WHATSAPP_CALL_TERMINAL_STATUSES: WhatsappCallStatus[] = [
  "rejected",
  "completed",
  "failed",
]

export const canAdvanceStatus = (
  current: WhatsappCallStatus,
  next: WhatsappCallStatus,
): boolean => {
  if (next === "rejected" && current === "failed") {
    return true
  }
  return STATUS_RANK[next] > STATUS_RANK[current]
}

/** Thrown by `attachWacid` when the row already carries a different wacid. */
export class WhatsappCallUuidMismatchError extends Error {
  constructor(wacid: string) {
    super(
      `call-uuid-mismatch: wacid ${wacid} is already bound to another call row`,
    )
    this.name = "WhatsappCallUuidMismatchError"
  }
}

/**
 * Thrown when `WhatsappCall_pendingOutbound_key` (one live outbound attempt per
 * contact inbox) is taken — shown as "call already in progress".
 */
export class WhatsappCallPendingOutboundExistsError extends Error {
  constructor(contactInboxId: string) {
    super(
      `pending-outbound-exists: contactInbox ${contactInboxId} already has a live business-initiated call`,
    )
    this.name = "WhatsappCallPendingOutboundExistsError"
  }
}

const isUniqueViolation = (error: unknown, constraint: string): boolean => {
  if (!(error instanceof DrizzleQueryError)) {
    return false
  }
  const cause = error.cause as
    | { code?: string; constraint?: string }
    | undefined
  return cause?.code === "23505" && cause?.constraint === constraint
}

/**
 * Which calls a Calls-page viewer may see, resolved by the business layer and
 * passed in as data. `allCalls` sees everything and may filter by agent;
 * otherwise only own calls, and an `assignedOnly` member only on conversations
 * assigned to them.
 */
export type WhatsappCallHistoryScope =
  | { allCalls: true }
  | { allCalls: false; userId: string; assignedOnly: boolean }

/**
 * Calls-page filters. `outcome` matches `coalesce(outcome, status)`;
 * `agentUserId` applies only with `allCalls`.
 */
export type WhatsappCallListFilters = {
  direction?: WhatsappCallDirection
  inboxId?: string
  agentUserId?: string
  outcome?: WhatsappCallOutcome
  /** Non-terminal (ongoing) rows only. */
  ongoing?: boolean
}

/**
 * `createdAt` travels as the DB's text form, not a JS `Date`: a `Date` keeps
 * milliseconds only, so rows created in the same millisecond would be skipped
 * by the next page. Read with `::text`, bound back with `::timestamptz`.
 */
export type WhatsappCallListCursor = { createdAt: string; id: string }

export type WhatsappCallListRow = WhatsappCallRow & {
  /**
   * Full-precision `createdAt` for the next page's cursor; `createdAt` itself
   * stays a `Date` for display.
   */
  createdAtCursor: string
  contact: { id: string; fullName: string | null; avatar: string | null }
  inbox: { id: string; name: string }
  answeredByUser: { id: string; name: string | null; email: string } | null
  initiatedByUser: { id: string; name: string | null; email: string } | null
}

/**
 * Terminal statuses that are also valid outcomes — the SQL half of
 * `coalesce(outcome, status)`. No `canceled`: status alone can never imply it.
 */
const LEGACY_STATUS_FALLBACK_BY_OUTCOME: Partial<
  Record<WhatsappCallOutcome, WhatsappCallStatus>
> = {
  completed: "completed",
  rejected: "rejected",
  failed: "failed",
}

class WhatsappCallRepository {
  async findById(
    id: string,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx.query.whatsappCallModel.findFirst({ where: { id } })
  }

  async findByWacid(
    wacid: string,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx.query.whatsappCallModel.findFirst({ where: { wacid } })
  }

  /**
   * Scoped by `workspaceId` in SQL as well, so a caller that forgets its own
   * check cannot read another workspace's row.
   */
  async findByIdForWorkspace(
    id: string,
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx.query.whatsappCallModel.findFirst({
      where: { id, workspaceId },
    })
  }

  async findByAttemptId(
    attemptId: string,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx.query.whatsappCallModel.findFirst({
      where: { attemptId },
    })
  }

  /**
   * Inserts the call if its wacid is new, otherwise returns the existing row.
   * `isNew` says whether this insert won, so one-shot side effects fire once.
   * Conflicts on the partial unique index on `wacid`.
   */
  async createIfAbsent(
    input: WhatsappCallUpsertInput,
    tx: DatabaseClient = db,
  ): Promise<{ call: WhatsappCallRow; isNew: boolean }> {
    const inserted = await tx
      .insert(whatsappCallModel)
      .values(input)
      .onConflictDoNothing({
        target: whatsappCallModel.wacid,
        where: sql`${whatsappCallModel.wacid} IS NOT NULL`,
      })
      .returning()
      .then((rows) => rows[0])

    if (inserted) {
      return { call: inserted, isNew: true }
    }

    const existing = await this.findByWacid(input.wacid, tx)
    if (!existing) {
      throw new Error(`WhatsappCall upsert race lost for wacid ${input.wacid}`)
    }
    return { call: existing, isNew: false }
  }

  /**
   * Inserts an outbound attempt before dialing (`wacid` attached later).
   * `WhatsappCall_pendingOutbound_key` allows one live outbound row per contact
   * inbox; a second dial maps to `WhatsappCallPendingOutboundExistsError`.
   */
  async createPendingOutbound(
    input: {
      attemptId: string
      workspaceId: string
      inboxId: string
      contactInboxId: string
      conversationId: string
      /**
       * The agent placing the call, stamped at dial time so Meta's answer
       * webhook can target them and the recording upload's auth check passes.
       */
      answeredByUserId?: string | null
      /**
       * The agent who placed the call (labels the "Business" speaker);
       * `answeredByUserId` is who answered.
       */
      initiatedByUserId?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow> {
    try {
      const [row] = await tx
        .insert(whatsappCallModel)
        .values({
          ...input,
          answeredByUserId: input.answeredByUserId ?? null,
          initiatedByUserId: input.initiatedByUserId ?? null,
          wacid: null,
          direction: "businessInitiated",
          status: "ringing",
        })
        .returning()

      if (!row) {
        throw new Error(
          `WhatsappCall createPendingOutbound insert returned no row for attemptId ${input.attemptId}`,
        )
      }
      return row
    } catch (error) {
      if (isUniqueViolation(error, "WhatsappCall_pendingOutbound_key")) {
        throw new WhatsappCallPendingOutboundExistsError(input.contactInboxId)
      }
      throw error
    }
  }

  /**
   * Glare guard: any live row for this contact inbox, in either direction —
   * Meta would reject a second leg with 138003.
   */
  async findActiveByContactInbox(
    input: { inboxId: string; contactInboxId: string },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    const rows = await tx
      .select()
      .from(whatsappCallModel)
      .where(
        and(
          eq(whatsappCallModel.inboxId, input.inboxId),
          eq(whatsappCallModel.contactInboxId, input.contactInboxId),
          inArray(whatsappCallModel.status, ["ringing", "accepted"]),
        ),
      )
      .orderBy(desc(whatsappCallModel.createdAt))
      .limit(1)
    return rows[0]
  }

  /**
   * Attaches Meta's wacid to a row created without one. If another row already
   * owns it, merges them: the older row survives, taking the newer row's
   * attempt/recording fields where its own are null, and the newer row is
   * deleted.
   */
  async attachWacid(
    props: { id: string; wacid: string },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await this.runInTransaction(tx, async (trx) => {
      const current = await this.findById(props.id, trx)
      if (!current) {
        return
      }
      if (current.wacid === props.wacid) {
        return current
      }
      if (current.wacid && current.wacid !== props.wacid) {
        throw new WhatsappCallUuidMismatchError(props.wacid)
      }

      const updated = await trx
        .update(whatsappCallModel)
        .set({ wacid: props.wacid })
        .where(
          and(
            eq(whatsappCallModel.id, props.id),
            isNull(whatsappCallModel.wacid),
          ),
        )
        .returning()
        .then((rows) => rows[0])
      if (updated) {
        return updated
      }

      // Another row already owns this wacid — merge.
      const owner = await this.findByWacid(props.wacid, trx)
      if (!owner || owner.id === props.id) {
        // The conflicting row changed under us — return current state.
        return await this.findById(props.id, trx)
      }

      const [older, newer] =
        owner.createdAt.getTime() <= current.createdAt.getTime()
          ? [owner, current]
          : [current, owner]

      const merged = await trx
        .update(whatsappCallModel)
        .set(mergeOntoOlderRow(older, newer))
        .where(eq(whatsappCallModel.id, older.id))
        .returning()
        .then((rows) => rows[0])

      await trx
        .delete(whatsappCallModel)
        .where(eq(whatsappCallModel.id, newer.id))

      return merged
    })
  }

  /** Most recent recorded call — backs `{{last_call_recorded}}`. */
  async findLatestRecordedByContactId(
    contactId: string,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await this.findLatestByContactId(
      contactId,
      whatsappCallModel.recordingPath,
      tx,
    )
  }

  /** Most recent transcribed call — backs `{{last_call_transcript}}`. */
  async findLatestTranscribedByContactId(
    contactId: string,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await this.findLatestByContactId(
      contactId,
      whatsappCallModel.transcript,
      tx,
    )
  }

  private async findLatestByContactId(
    contactId: string,
    requiredColumn:
      | typeof whatsappCallModel.recordingPath
      | typeof whatsappCallModel.transcript,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    const rows = await tx
      .select({ call: whatsappCallModel })
      .from(whatsappCallModel)
      .innerJoin(
        contactInboxModel,
        eq(whatsappCallModel.contactInboxId, contactInboxModel.id),
      )
      .where(
        and(
          eq(contactInboxModel.contactId, contactId),
          isNotNull(requiredColumn),
        ),
      )
      .orderBy(desc(whatsappCallModel.createdAt))
      .limit(1)
    return rows[0]?.call
  }

  /**
   * Candidates for resume-after-refresh: rows that look resumable. The Redis
   * offer/control record is authoritative, since a row can still be `ringing`
   * after its offer expired. Bounded by `FIND_RINGING_BY_WORKSPACE_LIMIT`.
   */
  async findRingingByWorkspace(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow[]> {
    return await tx
      .select()
      .from(whatsappCallModel)
      .where(
        and(
          eq(whatsappCallModel.workspaceId, workspaceId),
          eq(whatsappCallModel.status, "ringing"),
          isNotNull(whatsappCallModel.wacid),
          isNull(whatsappCallModel.answeredByUserId),
        ),
      )
      .orderBy(desc(whatsappCallModel.createdAt))
      .limit(FIND_RINGING_BY_WORKSPACE_LIMIT)
  }

  /**
   * Stale `ringing` rows for the sweeper, oldest first. Bounded because each
   * costs a Redis read and possibly a Graph call; a backlog drains over later
   * runs.
   */
  async sweepStaleRinging(
    input: { olderThan: Date; limit: number },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow[]> {
    return await tx
      .select()
      .from(whatsappCallModel)
      .where(
        and(
          eq(whatsappCallModel.status, "ringing"),
          lt(whatsappCallModel.createdAt, input.olderThan),
        ),
      )
      .orderBy(whatsappCallModel.createdAt)
      .limit(input.limit)
  }

  /**
   * Recordings past their own integration's retention, joined via `inboxId`.
   * The caller repeats until a page comes back short.
   */
  async listRecordingsPastRetention(
    input: { limit: number; now?: Date },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow[]> {
    const now = input.now ?? new Date()
    const rows = await tx
      .select({ call: whatsappCallModel })
      .from(whatsappCallModel)
      .innerJoin(
        integrationWhatsappModel,
        eq(whatsappCallModel.inboxId, integrationWhatsappModel.inboxId),
      )
      .where(
        and(
          isNotNull(whatsappCallModel.recordingPath),
          isNotNull(whatsappCallModel.recordedAt),
          sql`${whatsappCallModel.recordedAt} < ${now} - (${integrationWhatsappModel.callRecordingRetentionDays} || ' days')::interval`,
        ),
      )
      .limit(input.limit)
    return rows.map((row) => row.call)
  }

  /** Clears a purged recording, keeping the transcript. Idempotent. */
  async clearRecording(
    props: { id: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(whatsappCallModel)
      .set({ recordingPath: null, recordedAt: null })
      .where(eq(whatsappCallModel.id, props.id))
  }

  /**
   * Records what recording was arranged at accept/connect time, so the card can
   * say no audio is coming instead of waiting. Written once per call.
   */
  async markRecordingArrangement(
    props: {
      id: string
      recordingRequested: boolean
      recordingFailureReason?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({
        recordingRequested: props.recordingRequested,
        recordingFailureReason: props.recordingFailureReason ?? null,
      })
      .where(eq(whatsappCallModel.id, props.id))
      .returning()
      .then((rows) => rows[0])
  }

  /**
   * Stamps the recording once — `recordedAt IS NULL` makes a redelivery a no-
   * op. The actual S3 key overrides the claimed path.
   */
  async attachRecording(
    props: { id: string; recordingPath: string; recordedAt: Date },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({
        recordingPath: props.recordingPath,
        recordedAt: props.recordedAt,
      })
      .where(
        and(
          eq(whatsappCallModel.id, props.id),
          isNull(whatsappCallModel.recordedAt),
        ),
      )
      .returning()
      .then((rows) => rows[0])
  }

  /**
   * Undoes an `attachRecording` stamp whose follow-up failed so the retry can
   * redo it. Guarded on the exact `recordedAt` written, so a newer stamp is
   * never cleared.
   */
  async releaseRecordingStamp(
    props: { id: string; recordedAt: Date },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({ recordingPath: null, recordedAt: null })
      .where(
        and(
          eq(whatsappCallModel.id, props.id),
          eq(whatsappCallModel.recordedAt, props.recordedAt),
        ),
      )
      .returning()
      .then((rows) => rows[0])
  }

  /**
   * Stamps the transcript once. `segments` is optional alongside the flat
   * `transcript`.
   */
  async attachTranscript(
    props: {
      id: string
      transcript: string
      transcribedAt: Date
      segments?: WhatsappCallTranscriptSegments | null
    },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({
        transcript: props.transcript,
        transcribedAt: props.transcribedAt,
        ...(props.segments === undefined
          ? {}
          : { transcriptSegments: props.segments }),
      })
      .where(
        and(
          eq(whatsappCallModel.id, props.id),
          isNull(whatsappCallModel.transcript),
        ),
      )
      .returning()
      .then((rows) => rows[0])
  }

  /**
   * Saves the AI summary once — a second concurrent click is a no-op.
   * "Regenerate" uses `replaceAiSummary` instead.
   */
  async attachAiSummary(
    props: {
      id: string
      aiSummary: WhatsappCallAiSummary
      aiSummaryProvider: string
      /** Injectable for tests; defaults to `now`. */
      aiSummarizedAt?: Date
    },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({
        aiSummary: props.aiSummary,
        aiSummaryProvider: props.aiSummaryProvider,
        aiSummarizedAt: props.aiSummarizedAt ?? new Date(),
      })
      .where(
        and(
          eq(whatsappCallModel.id, props.id),
          isNull(whatsappCallModel.aiSummarizedAt),
        ),
      )
      .returning()
      .then((rows) => rows[0])
  }

  /**
   * Unconditional overwrite for the user-confirmed "Regenerate" action only.
   */
  async overwriteAiSummary(
    props: {
      id: string
      aiSummary: WhatsappCallAiSummary
      aiSummaryProvider: string
      /** Injectable for tests; defaults to `now`. */
      aiSummarizedAt?: Date
    },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({
        aiSummary: props.aiSummary,
        aiSummaryProvider: props.aiSummaryProvider,
        aiSummarizedAt: props.aiSummarizedAt ?? new Date(),
      })
      .where(eq(whatsappCallModel.id, props.id))
      .returning()
      .then((rows) => rows[0])
  }

  /**
   * Advances to an interim status per `canAdvanceStatus`; out-of-order updates
   * are no-ops and the WHERE re-checks the observed status. Only `rejected`
   * writes `outcome`. Returns the previous status when an update applied, so
   * callers react to the real transition.
   */
  async updateInterimStatus(
    props: {
      wacid: string
      status: "ringing" | "accepted" | "rejected"
      /** Pre-fetched row to avoid a redundant read on the common path. */
      current?: WhatsappCallRow
    },
    tx: DatabaseClient = db,
  ): Promise<{ previousStatus: WhatsappCallStatus } | undefined> {
    const set =
      props.status === "rejected"
        ? {
            status: props.status,
            outcome: resolveWhatsappCallOutcome({ status: props.status }),
          }
        : { status: props.status }

    // Retried once: a concurrent writer can invalidate the optimistic WHERE
    // between read and update.
    let existing = props.current
    for (let attempt = 0; attempt < 2; attempt++) {
      existing ??= await this.findByWacid(props.wacid, tx)
      if (!(existing && canAdvanceStatus(existing.status, props.status))) {
        return
      }

      const updated = await tx
        .update(whatsappCallModel)
        .set(set)
        .where(
          and(
            eq(whatsappCallModel.wacid, props.wacid),
            eq(whatsappCallModel.status, existing.status),
          ),
        )
        .returning({ id: whatsappCallModel.id })
        .then((rows) => rows[0])

      if (updated) {
        return { previousStatus: existing.status }
      }
      // Lost the optimistic WHERE — re-read on retry.
      existing = undefined
    }
    return
  }

  /**
   * The only writer of `accepted` + `answeredByUserId`. One conditional UPDATE,
   * so a terminal status written first always wins.
   */
  async markAcceptedIfActive(
    props: { id: string; answeredByUserId: string },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({ status: "accepted", answeredByUserId: props.answeredByUserId })
      .where(
        and(
          eq(whatsappCallModel.id, props.id),
          notInArray(whatsappCallModel.status, WHATSAPP_CALL_TERMINAL_STATUSES),
        ),
      )
      .returning()
      .then((rows) => rows[0])
  }

  /**
   * Heartbeat for an `accepted` call. The `updatedAt < olderThan` WHERE is the
   * throttle, and the status guard means it can never resurrect a terminal row
   * — and exactly one of it and `recoverStrandedAccepted` can win.
   */
  async touchLivenessIfStale(
    props: { id: string; olderThan: Date },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(whatsappCallModel)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(whatsappCallModel.id, props.id),
          eq(whatsappCallModel.status, "accepted"),
          lt(whatsappCallModel.updatedAt, props.olderThan),
        ),
      )
      .returning({ id: whatsappCallModel.id })
    return rows.length > 0
  }

  /**
   * Recovers a call stuck `accepted` after a lost terminate, in one conditional
   * UPDATE — two statements would leave a gap where a live call's heartbeat
   * could not save it. Returns the row only if this caller transitioned it;
   * empty means re-read, not "done". `endedAt` stays null (the real end time is
   * unknown), so a late terminate can still fill it.
   */
  async recoverStrandedAccepted(
    props: { id: string; olderThan: Date; lastError: string },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({
        status: "completed",
        outcome: resolveWhatsappCallOutcome({ status: "completed" }),
        lastError: props.lastError,
      })
      .where(
        and(
          eq(whatsappCallModel.id, props.id),
          eq(whatsappCallModel.status, "accepted"),
          lt(whatsappCallModel.updatedAt, props.olderThan),
        ),
      )
      .returning()
      .then((rows) => rows[0])
  }

  /**
   * Finalizes the call, never downgrading (`canAdvanceStatus`), with the same
   * optimistic re-check. On a same-status redelivery only still-missing fields
   * are filled, so an earlier `endedAt` or `outcome` (e.g. `canceled`) is never
   * overwritten.
   */
  async finalizeById(
    props: {
      id: string
      startedAt?: Date | null
      endedAt?: Date | null
      durationSeconds?: number | null
      messageId?: string | null
      lastError?: string | null
      answeredByUserId?: string | null
      current?: WhatsappCallRow
    } & WhatsappCallTerminalStatusOutcomePair,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    const { id, status, current, ...data } = props

    let existing = current
    for (let attempt = 0; attempt < 2; attempt++) {
      existing ??= await this.findById(id, tx)
      if (!existing) {
        return
      }

      if (!canAdvanceStatus(existing.status, status)) {
        if (existing.status !== status) {
          return
        }
        return await this.fillMissingTerminalFields(
          { id, current: existing, data },
          tx,
        )
      }

      const updated = await tx
        .update(whatsappCallModel)
        .set({ ...data, status })
        .where(
          and(
            eq(whatsappCallModel.id, id),
            eq(whatsappCallModel.status, existing.status),
          ),
        )
        .returning()
        .then((rows) => rows[0])

      if (updated) {
        return updated
      }
      existing = undefined
    }
    return
  }

  /**
   * Same-status redelivery: fills terminal fields still missing, each with its
   * own `IS NULL` guard so a concurrent writer's value is never clobbered.
   */
  private async fillMissingTerminalFields(
    props: {
      id: string
      current: WhatsappCallRow
      data: Omit<
        Parameters<WhatsappCallRepository["finalizeById"]>[0],
        "id" | "status" | "current"
      >
    },
    tx: DatabaseClient,
  ): Promise<WhatsappCallRow | undefined> {
    const { current, data } = props

    const fillEntries = FILLABLE_TERMINAL_FIELDS.flatMap((field) => {
      const currentValue = current[field]
      const nextValue = data[field]
      return currentValue === null && nextValue != null
        ? [{ field, value: nextValue }]
        : []
    })

    if (fillEntries.length === 0) {
      return current
    }

    const fillable = Object.fromEntries(
      fillEntries.map(({ field, value }) => [field, value]),
    ) as Partial<WhatsappCallRow>
    const nullGuards = fillEntries.map(({ field }) =>
      isNull(whatsappCallModel[field]),
    )

    const updated = await tx
      .update(whatsappCallModel)
      .set(fillable)
      .where(
        and(
          eq(whatsappCallModel.id, props.id),
          eq(whatsappCallModel.status, current.status),
          ...nullGuards,
        ),
      )
      .returning()
      .then((rows) => rows[0])

    return updated ?? current
  }

  /**
   * Calls-page list query. Never joins the sharded `Message` table. Keyset
   * pagination on `(createdAt desc, id desc)` matching the composite index; the
   * caller asks for `limit + 1` to detect more pages without `COUNT(*)`.
   */
  async listForWorkspace(
    input: {
      workspaceId: string
      scope: WhatsappCallHistoryScope
      filters?: WhatsappCallListFilters
      cursor?: WhatsappCallListCursor
      limit: number
    },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallListRow[]> {
    const { filters = {} } = input

    // `userModel` aliased twice (answered-by / initiated-by); built here so
    // partial test mocks without `userModel` never pay for it at import.
    const answeredByUserAlias = alias(userModel, "answeredByUser")
    const initiatedByUserAlias = alias(userModel, "initiatedByUser")

    const legacyStatusFallback = filters.outcome
      ? LEGACY_STATUS_FALLBACK_BY_OUTCOME[filters.outcome]
      : undefined

    const outcomeCondition = filters.outcome
      ? or(
          eq(whatsappCallModel.outcome, filters.outcome),
          legacyStatusFallback
            ? and(
                isNull(whatsappCallModel.outcome),
                eq(whatsappCallModel.status, legacyStatusFallback),
              )
            : undefined,
        )
      : undefined

    const scopeCondition = input.scope.allCalls
      ? undefined
      : and(
          or(
            eq(whatsappCallModel.answeredByUserId, input.scope.userId),
            eq(whatsappCallModel.initiatedByUserId, input.scope.userId),
          ),
          input.scope.assignedOnly
            ? eq(conversationModel.assignedUserId, input.scope.userId)
            : undefined,
        )

    // Bound as the cursor's text cast to `timestamptz` — a JS `Date` would drop
    // sub-millisecond digits. Still parameterised.
    const cursorCondition = input.cursor
      ? or(
          sql`${whatsappCallModel.createdAt} < ${input.cursor.createdAt}::timestamptz`,
          and(
            sql`${whatsappCallModel.createdAt} = ${input.cursor.createdAt}::timestamptz`,
            lt(whatsappCallModel.id, input.cursor.id),
          ),
        )
      : undefined

    const where = and(
      eq(whatsappCallModel.workspaceId, input.workspaceId),
      scopeCondition,
      filters.ongoing
        ? inArray(whatsappCallModel.status, ["ringing", "accepted"])
        : undefined,
      filters.direction
        ? eq(whatsappCallModel.direction, filters.direction)
        : undefined,
      filters.inboxId
        ? eq(whatsappCallModel.inboxId, filters.inboxId)
        : undefined,
      input.scope.allCalls && filters.agentUserId
        ? or(
            eq(whatsappCallModel.answeredByUserId, filters.agentUserId),
            eq(whatsappCallModel.initiatedByUserId, filters.agentUserId),
          )
        : undefined,
      outcomeCondition,
      cursorCondition,
    )

    const rows = await tx
      .select({
        call: whatsappCallModel,
        // Full-precision text `createdAt` — see `WhatsappCallListCursor`.
        createdAtCursor: sql<string>`${whatsappCallModel.createdAt}::text`,
        contact: {
          id: contactModel.id,
          fullName: contactModel.fullName,
          avatar: contactModel.avatar,
        },
        inbox: { id: inboxModel.id, name: inboxModel.name },
        answeredByUser: {
          id: answeredByUserAlias.id,
          name: answeredByUserAlias.name,
          email: answeredByUserAlias.email,
        },
        initiatedByUser: {
          id: initiatedByUserAlias.id,
          name: initiatedByUserAlias.name,
          email: initiatedByUserAlias.email,
        },
      })
      .from(whatsappCallModel)
      .innerJoin(
        contactInboxModel,
        eq(contactInboxModel.id, whatsappCallModel.contactInboxId),
      )
      .innerJoin(contactModel, eq(contactModel.id, contactInboxModel.contactId))
      .innerJoin(inboxModel, eq(inboxModel.id, whatsappCallModel.inboxId))
      .innerJoin(
        conversationModel,
        eq(conversationModel.id, whatsappCallModel.conversationId),
      )
      .leftJoin(
        answeredByUserAlias,
        eq(answeredByUserAlias.id, whatsappCallModel.answeredByUserId),
      )
      .leftJoin(
        initiatedByUserAlias,
        eq(initiatedByUserAlias.id, whatsappCallModel.initiatedByUserId),
      )
      .where(where)
      .orderBy(desc(whatsappCallModel.createdAt), desc(whatsappCallModel.id))
      .limit(input.limit)

    return rows.map((row) => ({
      ...row.call,
      createdAtCursor: row.createdAtCursor,
      contact: row.contact,
      inbox: row.inbox,
      answeredByUser: row.answeredByUser?.id ? row.answeredByUser : null,
      initiatedByUser: row.initiatedByUser?.id ? row.initiatedByUser : null,
    }))
  }

  /** Runs `fn` in a transaction unless `tx` already is one. */
  private async runInTransaction<T>(
    tx: DatabaseClient,
    fn: (trx: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    if (tx !== db) {
      return await fn(tx)
    }
    return await db.transaction((trx) => fn(trx))
  }
}

export const whatsappCallRepository = new WhatsappCallRepository()
