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
  sql,
} from "../../client"
import type {
  WhatsappCallAiSummary,
  WhatsappCallDirection,
  WhatsappCallStatus,
  WhatsappCallTranscriptSegments,
} from "../../partials/whatsapp-call"
import {
  contactInboxModel,
  integrationWhatsappModel,
  whatsappCallModel,
} from "../../schema"

type WhatsappCallRow = typeof whatsappCallModel.$inferSelect

/**
 * Every terminal-metadata column `fillMissingTerminalFields` is allowed to
 * fill on a same-status redelivery. Iterated (rather than one copy-pasted
 * `if` per column) so a new column is a one-line addition here, and so every
 * filled column automatically gets its own `IS NULL` guard in the `WHERE`
 * clause — see {@link WhatsappCallRepository.fillMissingTerminalFields}.
 */
const FILLABLE_TERMINAL_FIELDS = [
  "endedAt",
  "startedAt",
  "durationSeconds",
  "messageId",
  "lastError",
] as const satisfies readonly (keyof WhatsappCallRow)[]

type WhatsappCallUpsertInput = {
  wacid: string
  direction: WhatsappCallDirection
  status: WhatsappCallStatus
  workspaceId: string
  inboxId: string
  contactInboxId: string
  conversationId: string
  startedAt?: Date | null
  endedAt?: Date | null
  durationSeconds?: number | null
}

/**
 * Small bound on `findRingingByWorkspace` — a resume-after-refresh lookup is
 * expected to find at most a handful of concurrently ringing calls per
 * workspace; this keeps the scan (and the caller's bounded Redis reads)
 * cheap even under an anomalous backlog.
 */
const FIND_RINGING_BY_WORKSPACE_LIMIT = 20

/**
 * The merge-collision-safe fields `attachWacid` moves onto the surviving
 * (older) row from the row being deleted, keeping the survivor's own value
 * where it is already set.
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
 * Lifecycle ordering guard: webhook and signaling jobs are processed
 * concurrently, so a late RINGING/ACCEPTED can land after the terminate for
 * the same call. A status may only advance to a higher rank — with one
 * deliberate exception: `rejected` may overwrite `failed`, because a
 * declined call terminates as FAILED and the interim REJECTED status can
 * arrive after the terminate job already finalized the row. `completed` is
 * always the top rank so it can never be downgraded once reached.
 */
const STATUS_RANK: Record<WhatsappCallStatus, number> = {
  ringing: 0,
  accepted: 1,
  rejected: 2,
  failed: 3,
  completed: 4,
}

/**
 * The persisted terminal statuses — a row in any of these can never be
 * resurrected into `accepted`. `missed` is deliberately NOT here: it is
 * UI-derived (a `failed` row that was never `accepted`), never a value
 * written to the column. See {@link WhatsappCallRepository.markAcceptedIfActive}.
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
 * Thrown by `createPendingOutbound` when `WhatsappCall_pendingOutbound_key`
 * (one live business-initiated attempt per contact-inbox) is already held —
 * `initiateOutboundVoipCallAction` surfaces this as a localized "call already in
 * progress" error instead of dialing a second leg.
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
   * Defense-in-depth (belt and suspenders) on top of a caller's own
   * app-level `workspaceId` check: scopes the lookup by `workspaceId`
   * directly in the SQL `WHERE` clause, so a caller that ever forgets its
   * own check can never read another workspace's call row.
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
   * Creates the call row if the wacid is new; otherwise returns the existing
   * row untouched. Safe against duplicate webhook deliveries and races —
   * `isNew` tells the caller whether ITS insert won, so one-shot side
   * effects (trigger events, ringing broadcasts) fire exactly once.
   *
   * The conflict target is the PARTIAL unique index on `wacid` (nullable
   * column), so a concurrent insert for the same wacid is absorbed instead
   * of creating a duplicate row.
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
   * Inserts the row for a business-initiated attempt BEFORE dialing
   * (outbound flow): `attemptId` minted by the caller and `wacid` still
   * null (attached by `attachWacid` once Meta reports the call id). The
   * partial unique index `WhatsappCall_pendingOutbound_key` allows only one
   * live (`ringing`/`accepted`) business-initiated row per
   * `(inboxId, contactInboxId)` — a concurrent second dial hits that
   * constraint and is mapped to {@link WhatsappCallPendingOutboundExistsError}
   * instead of a raw Postgres error.
   */
  async createPendingOutbound(
    input: {
      attemptId: string
      workspaceId: string
      inboxId: string
      contactInboxId: string
      conversationId: string
      /**
       * The agent initiating a VoIP-mode outbound call — stamped onto the
       * row at dial time (not just on accept, unlike the SIP flow's
       * `markAcceptedIfActive`) so Meta's async answer webhook can be
       * targeted at them and the recording upload route's
       * `answeredByUserId === userId` auth gate passes. Absent for the SIP
       * outbound flow, which leaves this null.
       */
      answeredByUserId?: string | null
      /**
       * The agent who PLACED this outbound call — distinct from
       * `answeredByUserId` (who ANSWERS, only meaningful for inbound calls).
       * Used to label the "Business" speaker in the Call Information sheet.
       * Typically the same agent as `answeredByUserId` for a VoIP outbound
       * call; left null for the SIP outbound flow like `answeredByUserId`.
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
   * The glare guard for VoIP-mode outbound dialing: any `ringing`/`accepted`
   * row for this `(inboxId, contactInboxId)` pair, of EITHER direction — an
   * inbound call currently ringing/live on this contact must block a new
   * outbound dial exactly like an already-live outbound attempt does (Meta
   * itself would reject the second leg with 138003). Ordered newest-first
   * and bounded to one row; the caller only needs to know whether one
   * exists, not enumerate them.
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
   * Attaches a Meta-reported `wacid` to a row that was created without one
   * (an outbound row inserted at dial time, before Meta's webhook lands).
   * No-op if the row already has this exact wacid. If another row already
   * owns it (both the dial and the webhook created independent rows for the
   * same call), the two are merged in one transaction: the OLDER row
   * survives, the newer row's attempt/recording fields are moved onto it
   * where the survivor's own value is null, and the newer row is deleted.
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

      // Lost the race: another row already owns this wacid. Merge.
      const owner = await this.findByWacid(props.wacid, trx)
      if (!owner || owner.id === props.id) {
        // The conflicting row disappeared/changed under us — surface the
        // current state rather than guess.
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

  /**
   * The contact's most recent call that produced a recording — backs the
   * `{{last_call_recorded}}` system field.
   */
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

  /**
   * The contact's most recent call that produced a transcript — backs the
   * `{{last_call_transcript}}` system field.
   */
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
   * Coarse DB-side prefilter for "still-ringing, unclaimed calls" in a
   * workspace — backs the on-mount resume-after-refresh fetch
   * (`whatsappVoipCallService.getResumableIncoming`). `wacid IS NOT NULL AND
   * answeredByUserId IS NULL` only narrows to rows that LOOK resumable; the
   * AUTHORITATIVE check is the Redis offer/control record the service layer
   * reads for each candidate, since a row can still be `ringing` here after
   * its offer has already expired. Ordered newest-first and bounded by
   * {@link FIND_RINGING_BY_WORKSPACE_LIMIT} so a busy workspace never
   * triggers an unbounded scan or an unbounded number of Redis reads.
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
   * `ringing` rows older than `olderThan` that no lifecycle event ever
   * finalized — the stale-call sweeper's source of candidate rows.
   *
   * Bounded by `limit` (oldest first) because the sweeper does per-row work
   * (a Redis control read, and possibly a Graph terminate) for every
   * candidate: an unbounded result would turn one backlogged sweep into an
   * unbounded read plus an unbounded burst of outbound calls. The sweeper
   * runs on a fixed schedule, so a backlog larger than one page simply
   * drains across the following runs.
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
   * Retention sweep candidates (`purgeExpiredCallRecordings`): rows
   * with a recording older than THEIR OWN integration's
   * `callRecordingRetentionDays`, joined by `inboxId` (the only path from
   * `WhatsappCall` to `IntegrationWhatsapp`, same join shape as
   * `listActiveByIntegrationIds`). Cursor-style via `limit` only — the
   * caller re-invokes until a pass returns fewer than `limit` rows.
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

  /**
   * Clears a purged recording's columns — keeps the transcript (delete
   * the S3 object → null `recordingPath`/`recordedAt`, keep the
   * transcript). Idempotent: a redelivered purge of an already-cleared row
   * is a no-op.
   */
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
   * Finalizes the recording exactly once when the upload lands — the CAS on
   * `recordedAt IS NULL` makes a redelivered upload a no-op (`undefined`
   * return). `recordingPath` is overwritten with the actual S3 key, which
   * is authoritative over the claimed path.
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
   * Stamps the transcript exactly once (same no-op-on-redelivery contract).
   * `segments` is optional and additive alongside the flat `transcript`:
   * a SIP/Whisper writer may pass only the flat text, while a Meta-native
   * VoIP writer passes both (diarized `segments` + the flattened
   * `transcript` for `{{last_call_transcript}}`/search).
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
   * Persists the on-demand AI summary exactly once, same no-op-on-
   * redelivery contract as `attachTranscript`/`attachRecording` — a
   * concurrent second "Generate summary" click for the same call is a
   * no-op rather than clobbering the first result. A deliberate
   * "Regenerate" (behind a confirm, per the plan) is a separate,
   * unconditional write and does not use this method's CAS guard — it
   * should update the row directly.
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
   * The "Regenerate" counterpart to {@link attachAiSummary} — an
   * unconditional overwrite with no `isNull(aiSummarizedAt)` CAS guard, as
   * called out in that method's docstring. Only reached from the
   * user-confirmed "Regenerate" action, never from an
   * automatic/redelivered path, so clobbering the previous summary is the
   * intended behavior here.
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
   * Advances the call to an interim status (ringing/accepted/rejected),
   * respecting {@link canAdvanceStatus} — a stale or out-of-order status is
   * a no-op. The WHERE re-checks the observed status so a concurrent writer
   * cannot be overwritten with stale data.
   *
   * Returns the status the row transitioned FROM when an update was applied
   * (`undefined` otherwise), so callers can react to the actual DB
   * transition rather than their own possibly-stale read — e.g. the
   * `failed → rejected` repair of the call-activity message.
   */
  async updateInterimStatus(
    props: {
      wacid: string
      status: WhatsappCallStatus
      /** Pre-fetched row to avoid a redundant read on the common path. */
      current?: WhatsappCallRow
    },
    tx: DatabaseClient = db,
  ): Promise<{ previousStatus: WhatsappCallStatus } | undefined> {
    // Retried once: a concurrent writer can invalidate the optimistic WHERE
    // between the read and the update (e.g. terminate finalizing to `failed`
    // right before a REJECTED lands). The caller-supplied `current` seeds the
    // first attempt; the race-retry always re-reads to observe the new status.
    let existing = props.current
    for (let attempt = 0; attempt < 2; attempt++) {
      existing ??= await this.findByWacid(props.wacid, tx)
      if (!(existing && canAdvanceStatus(existing.status, props.status))) {
        return
      }

      const updated = await tx
        .update(whatsappCallModel)
        .set({ status: props.status })
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
      // Lost the optimistic WHERE — force a fresh read on the retry.
      existing = undefined
    }
    return
  }

  /**
   * Guarded acceptance persistence — the ONLY writer of `accepted` +
   * `answeredByUserId` for the VoIP flow. One conditional UPDATE (never a
   * read-then-write) so PostgreSQL re-evaluates the terminal-status
   * predicate under row lock: a terminal write (rejected/completed/failed)
   * that landed first wins permanently and this call becomes a no-op,
   * rather than resurrecting the row into `accepted`.
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
   * Durable liveness for an `accepted` call: `UPDATE … SET updatedAt = now()
   * WHERE id = ? AND status = 'accepted' AND updatedAt < olderThan`. The
   * browser heartbeat calls it with a short `olderThan`, so the throttle is
   * the DB's own WHERE clause — no caller has to remember when it last wrote,
   * and concurrent beats cannot double-write.
   *
   * Status-guarded, so an already-terminal row is never resurrected — which
   * is also what makes it race-free against
   * {@link WhatsappCallRepository.recoverStrandedAccepted}: exactly one of the
   * two can win, and a heartbeat losing means the row is already terminal.
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
   * Dial-time recovery of a call stuck `accepted` because its `terminate`
   * webhook was lost, as ONE conditional statement:
   * `UPDATE … SET status = 'completed', endedAt, lastError
   *  WHERE id = ? AND status = 'accepted' AND updatedAt < olderThan
   *  RETURNING *`.
   *
   * Claiming the stale row and terminalizing it cannot be two statements: in
   * the gap between them a heartbeat would be unable to signal liveness (its
   * own throttle predicate would already be satisfied by the claim's write),
   * so a live call could be closed. Here there is no gap — a heartbeat either
   * lands first, bumping `updatedAt` so this UPDATE matches nothing, or lands
   * after, finding a row that is no longer `accepted`.
   *
   * Returns the row only when THIS caller performed the transition. An empty
   * result is never "already done": a real terminate that got there first
   * also matches nothing, and the caller must re-read rather than assume it
   * recovered anything.
   *
   * `endedAt` is deliberately left NULL. We know the call is over, never when
   * it ended — "now" would record the moment somebody happened to redial,
   * often long after the fact. Leaving it null also keeps a delayed terminate
   * authoritative: {@link WhatsappCallRepository.finalizeById}'s same-status
   * path fills only fields that are still missing, so a redelivered webhook
   * can still stamp the real `endedAt` afterwards, but could never correct a
   * value we had invented.
   */
  async recoverStrandedAccepted(
    props: { id: string; olderThan: Date; lastError: string },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({ status: "completed", lastError: props.lastError })
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
   * Finalizes the call by id — guarded by {@link canAdvanceStatus} so a
   * `completed` row can never be downgraded (e.g. a delayed `failed` from a
   * stale hangup-cause map race). The WHERE re-checks the observed status,
   * same optimistic-lock discipline as `updateInterimStatus`.
   *
   * Idempotency gap closed: a terminate arriving after a locally-written
   * terminal status (same `status`, e.g. two independent `rejected` writes)
   * used to return early WITHOUT writing `endedAt`/terminal metadata. When
   * the incoming status exactly matches the current terminal status, this
   * now fills in ONLY the fields still missing (`endedAt` in particular) via
   * a `WHERE … endedAt IS NULL`-guarded UPDATE — it never downgrades status
   * and never overwrites an earlier authoritative `endedAt`.
   */
  async finalizeById(
    props: {
      id: string
      status: WhatsappCallStatus
      startedAt?: Date | null
      endedAt?: Date | null
      durationSeconds?: number | null
      messageId?: string | null
      lastError?: string | null
      answeredByUserId?: string | null
      current?: WhatsappCallRow
    },
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
   * Same-status terminate redelivery: `existing.status === status` already
   * (so no rank change), but one or more terminal metadata fields may still
   * be missing from an earlier write that only set `status` (e.g.
   * `updateInterimStatus`'s `rejected`-only path). Fills every still-missing
   * field in {@link FILLABLE_TERMINAL_FIELDS} exactly once.
   *
   * EVERY filled column gets its own `IS NULL` guard in the `WHERE` clause
   * (not just `endedAt`), so a redelivery can only ever fill a column that is
   * STILL null right now — a concurrent writer that already set, say,
   * `messageId` or `lastError` between this method's read and its `UPDATE`
   * is never clobbered by this redelivery's (possibly different/stale)
   * value for that column.
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
   * Runs `fn` inside a transaction unless `tx` is already one (repositories
   * accept either `db` or an ambient `Transaction`, and nesting
   * `db.transaction` inside an existing transaction is unnecessary — every
   * write already commits atomically with the caller's).
   */
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
