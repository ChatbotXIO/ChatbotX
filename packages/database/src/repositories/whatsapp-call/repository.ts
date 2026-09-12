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
  or,
  sql,
} from "../../client"
import type {
  WhatsappCallDirection,
  WhatsappCallStatus,
} from "../../partials/whatsapp-call"
import {
  contactInboxModel,
  integrationWhatsappModel,
  whatsappCallModel,
} from "../../schema"

type WhatsappCallRow = typeof whatsappCallModel.$inferSelect

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

type CreateFromFreeswitchInput = {
  freeswitchUuid: string
  wacid?: string | null
  attemptId?: string | null
  workspaceId: string
  inboxId: string
  contactInboxId: string
  conversationId: string
  direction: WhatsappCallDirection
  status: WhatsappCallStatus
}

type UpsertInboundInput = {
  wacid: string | null
  freeswitchUuid: string
  attemptId: string
  workspaceId: string
  inboxId: string
  contactInboxId: string
  conversationId: string
  direction: WhatsappCallDirection
  status: WhatsappCallStatus
}

type CursorPage = { createdAt: Date; id: string }

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
  | "freeswitchUuid"
  | "attemptId"
  | "freeswitchBLegUuid"
  | "recordingPath"
  | "recordedAt"
  | "transcript"
  | "transcribedAt"
> => ({
  freeswitchUuid: older.freeswitchUuid ?? newer.freeswitchUuid,
  attemptId: older.attemptId ?? newer.attemptId,
  freeswitchBLegUuid: older.freeswitchBLegUuid ?? newer.freeswitchBLegUuid,
  recordingPath: older.recordingPath ?? newer.recordingPath,
  recordedAt: older.recordedAt ?? newer.recordedAt,
  transcript: older.transcript ?? newer.transcript,
  transcribedAt: older.transcribedAt ?? newer.transcribedAt,
})

/**
 * Lifecycle ordering guard: webhook/FreeSWITCH jobs are processed
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

export const canAdvanceStatus = (
  current: WhatsappCallStatus,
  next: WhatsappCallStatus,
): boolean => {
  if (next === "rejected" && current === "failed") {
    return true
  }
  return STATUS_RANK[next] > STATUS_RANK[current]
}

/** Thrown by `attachFreeswitchUuid` when the outbound attempt row is gone or already bound elsewhere. */
export class WhatsappCallOutboundAttemptUnknownError extends Error {
  constructor(attemptId: string) {
    super(
      `outbound-attempt-unknown: no claimable row for attemptId ${attemptId}`,
    )
    this.name = "WhatsappCallOutboundAttemptUnknownError"
  }
}

/** Thrown by `upsertInbound`/`attachWacid` when a row's uuid conflicts with an existing wacid binding. */
export class WhatsappCallUuidMismatchError extends Error {
  constructor(wacid: string) {
    super(
      `call-uuid-mismatch: wacid ${wacid} already bound to a different freeswitchUuid`,
    )
    this.name = "WhatsappCallUuidMismatchError"
  }
}

/**
 * Thrown by `createPendingOutbound` when `WhatsappCall_pendingOutbound_key`
 * (one live business-initiated attempt per contact-inbox) is already held —
 * `startWhatsappCallAction` surfaces this as a localized "call already in
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

/** Keyset predicate for `ORDER BY createdAt DESC, id DESC` pagination. */
const beforeCursor = (cursor: CursorPage) =>
  or(
    lt(whatsappCallModel.createdAt, cursor.createdAt),
    and(
      eq(whatsappCallModel.createdAt, cursor.createdAt),
      lt(whatsappCallModel.id, cursor.id),
    ),
  )

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

  async findByAttemptId(
    attemptId: string,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx.query.whatsappCallModel.findFirst({
      where: { attemptId },
    })
  }

  async findByFreeswitchUuid(
    freeswitchUuid: string,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx.query.whatsappCallModel.findFirst({
      where: { freeswitchUuid },
      orderBy: { createdAt: "desc" },
    })
  }

  /**
   * Creates the call row if the wacid is new; otherwise returns the existing
   * row untouched. Safe against duplicate webhook deliveries and races —
   * `isNew` tells the caller whether ITS insert won, so one-shot side
   * effects (trigger events, ringing broadcasts) fire exactly once.
   *
   * The conflict target is the PARTIAL unique index on `wacid` (nullable
   * column), so this also tolerates a row FreeSWITCH already created for
   * the same wacid via `createFromFreeswitch`/`upsertInbound`.
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
   * (outbound flow): `attemptId` minted by the caller, `wacid`/
   * `freeswitchUuid` both null (attached later by `attachWacid`/
   * `attachFreeswitchUuid` once FreeSWITCH and/or Meta report them). The
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
    },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow> {
    try {
      const [row] = await tx
        .insert(whatsappCallModel)
        .values({
          ...input,
          wacid: null,
          freeswitchUuid: null,
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
   * The single pending (`wacid IS NULL`, `ringing`/`accepted`) outbound row
   * for a `(inboxId, contactInboxId)` pair, created within `since`:
   * Meta's `call_created`/`terminate` webhooks for a
   * BUSINESS_INITIATED call never create a row (a second row would violate
   * the one-call-per-(inbox, contactInbox) invariant a
   * `startWhatsappCallAction` attempt already established via
   * `createPendingOutbound`) — they resolve the row to attach to through
   * this lookup instead. Ordered newest-first so a caller ends up on the
   * most recent attempt if, for some reason, more than one qualifies (the
   * `WhatsappCall_pendingOutbound_key` partial unique index should already
   * prevent that for `ringing`/`accepted` rows, but the window bound here is
   * an explicit second safety net against attaching a webhook to a
   * stale/abandoned attempt).
   */
  async findPendingOutbound(
    input: { inboxId: string; contactInboxId: string; since: Date },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    const rows = await tx
      .select()
      .from(whatsappCallModel)
      .where(
        and(
          eq(whatsappCallModel.inboxId, input.inboxId),
          eq(whatsappCallModel.contactInboxId, input.contactInboxId),
          eq(whatsappCallModel.direction, "businessInitiated"),
          isNull(whatsappCallModel.wacid),
          inArray(whatsappCallModel.status, ["ringing", "accepted"]),
          sql`${whatsappCallModel.createdAt} >= ${input.since}`,
        ),
      )
      .orderBy(desc(whatsappCallModel.createdAt))
      .limit(1)
    return rows[0]
  }

  /**
   * Idempotent row creation from the FreeSWITCH side (`ensureCallRow`'s
   * inbound-without-webhook-yet path and the recording sweep). The conflict
   * target is the partial unique index on `freeswitchUuid` — the only id
   * every FreeSWITCH-side job for this call shares — so a redelivered
   * `cbx::call`/`RECORD_STOP` for the same channel is a no-op merge rather
   * than a duplicate row. `wacid` is only ever tightened (never cleared) by
   * the COALESCE, so a webhook that lands first is never overwritten.
   */
  async createFromFreeswitch(
    input: CreateFromFreeswitchInput,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow> {
    const [row] = await tx
      .insert(whatsappCallModel)
      .values(input)
      .onConflictDoUpdate({
        target: whatsappCallModel.freeswitchUuid,
        where: sql`${whatsappCallModel.freeswitchUuid} IS NOT NULL`,
        set: {
          wacid: sql`COALESCE(excluded."wacid", "WhatsappCall"."wacid")`,
        },
      })
      .returning()

    if (!row) {
      throw new Error(
        `WhatsappCall createFromFreeswitch race lost for freeswitchUuid ${input.freeswitchUuid}`,
      )
    }
    return row
  }

  /**
   * Binds the FreeSWITCH A-leg uuid onto an outbound row the action created
   * earlier (with a null uuid). The conditional UPDATE also tolerates a
   * retry that already attached the same uuid (idempotent), but never lets
   * a second, different uuid steal an already-bound row.
   */
  async attachFreeswitchUuid(
    props: { attemptId: string; freeswitchUuid: string },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow> {
    const [row] = await tx
      .update(whatsappCallModel)
      .set({ freeswitchUuid: props.freeswitchUuid })
      .where(
        and(
          eq(whatsappCallModel.attemptId, props.attemptId),
          or(
            isNull(whatsappCallModel.freeswitchUuid),
            eq(whatsappCallModel.freeswitchUuid, props.freeswitchUuid),
          ),
        ),
      )
      .returning()

    if (!row) {
      throw new WhatsappCallOutboundAttemptUnknownError(props.attemptId)
    }
    return row
  }

  /**
   * Reconciles an inbound call row whichever side (Meta webhook vs.
   * FreeSWITCH `cbx::call`) arrives first, per the persistence contract:
   *
   * 1. If `wacid` is known, try to attach the uuid to a row the webhook
   *    already created (`UPDATE … WHERE wacid = $wacid AND workspaceId =
   *    $ws`). A row with a DIFFERENT non-null uuid is a hard mismatch —
   *    never overwritten.
   * 2. Otherwise (or if (1) found no row), insert with `ON CONFLICT
   *    (freeswitchUuid) … DO UPDATE` so a concurrent FreeSWITCH-side insert
   *    for the same uuid is absorbed instead of erroring.
   * 3. If (2) raises `23505` on the wacid partial unique index (the
   *    webhook's row landed between steps 1 and 2), retry step 1 once, then
   *    propagate the error.
   *
   * Both branches are idempotent under the integration worker's parallel
   * concurrency, so any job order converges on exactly one row.
   */
  async upsertInbound(
    input: UpsertInboundInput,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow> {
    return await this.runInTransaction(tx, (trx) =>
      this.upsertInboundStep(input, trx, false),
    )
  }

  private async upsertInboundStep(
    input: UpsertInboundInput,
    trx: DatabaseClient,
    isRetry: boolean,
  ): Promise<WhatsappCallRow> {
    if (input.wacid) {
      const attached = await this.attachUuidToWacidRow(
        {
          wacid: input.wacid,
          workspaceId: input.workspaceId,
          freeswitchUuid: input.freeswitchUuid,
        },
        trx,
      )
      if (attached) {
        return attached
      }
    }

    try {
      const [row] = await trx
        .insert(whatsappCallModel)
        .values({
          wacid: input.wacid,
          attemptId: input.attemptId,
          freeswitchUuid: input.freeswitchUuid,
          workspaceId: input.workspaceId,
          inboxId: input.inboxId,
          contactInboxId: input.contactInboxId,
          conversationId: input.conversationId,
          direction: input.direction,
          status: input.status,
        })
        .onConflictDoUpdate({
          target: whatsappCallModel.freeswitchUuid,
          where: sql`${whatsappCallModel.freeswitchUuid} IS NOT NULL`,
          set: {
            wacid: sql`COALESCE(excluded."wacid", "WhatsappCall"."wacid")`,
          },
        })
        .returning()

      if (!row) {
        throw new Error(
          `WhatsappCall upsertInbound race lost for freeswitchUuid ${input.freeswitchUuid}`,
        )
      }
      return row
    } catch (error) {
      if (
        !isRetry &&
        input.wacid &&
        isUniqueViolation(error, "WhatsappCall_wacid_key")
      ) {
        return await this.upsertInboundStep(input, trx, true)
      }
      throw error
    }
  }

  private async attachUuidToWacidRow(
    props: { wacid: string; workspaceId: string; freeswitchUuid: string },
    trx: DatabaseClient,
  ): Promise<WhatsappCallRow | undefined> {
    const [row] = await trx
      .update(whatsappCallModel)
      .set({
        freeswitchUuid: sql`COALESCE(${whatsappCallModel.freeswitchUuid}, ${props.freeswitchUuid})`,
      })
      .where(
        and(
          eq(whatsappCallModel.wacid, props.wacid),
          eq(whatsappCallModel.workspaceId, props.workspaceId),
        ),
      )
      .returning()

    if (!row) {
      return
    }
    if (row.freeswitchUuid && row.freeswitchUuid !== props.freeswitchUuid) {
      throw new WhatsappCallUuidMismatchError(props.wacid)
    }
    return row
  }

  /**
   * Attaches a Meta-reported `wacid` to a row that was created without one
   * (outbound rows before the webhook lands, or an inbound FreeSWITCH row
   * ahead of `call_created`). No-op if the row already has this exact
   * wacid. If another row already owns it (both sides created independent
   * rows for the same call), the two are merged in one transaction: the
   * OLDER row survives, the newer row's FreeSWITCH-side fields
   * (`freeswitchUuid`/`attemptId`/`freeswitchBLegUuid`/recording*) are
   * moved onto it where the survivor's own value is null, and the newer row
   * is deleted.
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

  /** Call log page: cursor-paginated `(createdAt, id)` scan, newest first. */
  async listByWorkspaceCursor(
    input: { workspaceId: string; cursor?: CursorPage; limit: number },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow[]> {
    return await tx
      .select()
      .from(whatsappCallModel)
      .where(
        and(
          eq(whatsappCallModel.workspaceId, input.workspaceId),
          input.cursor ? beforeCursor(input.cursor) : undefined,
        ),
      )
      .orderBy(desc(whatsappCallModel.createdAt), desc(whatsappCallModel.id))
      .limit(input.limit)
  }

  /**
   * `ringing` rows stuck without ever getting a FreeSWITCH uuid (dial
   * failed silently, or a lost `cbx::call`) older than `olderThan` — the
   * outbound sweeper's source of stale attempts.
   */
  async sweepStaleRinging(
    input: { olderThan: Date },
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
  }

  /**
   * `ringing`/`accepted` rows for a set of integrations — the ESL-gap
   * reconciliation loop's candidate set, joined through `inboxId` since
   * `WhatsappCall` has no direct `integrationId` column.
   */
  async listActiveByIntegrationIds(
    integrationIds: string[],
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow[]> {
    if (integrationIds.length === 0) {
      return []
    }
    const rows = await tx
      .select({ call: whatsappCallModel })
      .from(whatsappCallModel)
      .innerJoin(
        integrationWhatsappModel,
        eq(whatsappCallModel.inboxId, integrationWhatsappModel.inboxId),
      )
      .where(
        and(
          inArray(integrationWhatsappModel.id, integrationIds),
          inArray(whatsappCallModel.status, ["ringing", "accepted"]),
        ),
      )
    return rows.map((row) => row.call)
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
   * Records what a bridged B-leg reported when it hung up (the outbound Meta
   * gateway leg's SIP final response, or which agent leg answered) WITHOUT
   * touching the call's status: only the root A-leg terminates a call
   * (leg correlation) — in an inbound parallel fork one agent
   * declining must not end a call another agent can still answer.
   */
  async recordBLegOutcome(
    props: {
      id: string
      freeswitchBLegUuid: string
      lastError?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({
        freeswitchBLegUuid: props.freeswitchBLegUuid,
        ...(props.lastError === undefined
          ? {}
          : { lastError: props.lastError }),
      })
      .where(eq(whatsappCallModel.id, props.id))
      .returning()
      .then((rows) => rows[0])
  }

  /** Stamps the transcript exactly once (same no-op-on-redelivery contract). */
  async attachTranscript(
    props: { id: string; transcript: string; transcribedAt: Date },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({
        transcript: props.transcript,
        transcribedAt: props.transcribedAt,
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
   * Finalizes the call by id — guarded by {@link canAdvanceStatus} so a
   * `completed` row can never be downgraded (e.g. a delayed `failed` from a
   * stale hangup-cause map race). The WHERE re-checks the observed status,
   * same optimistic-lock discipline as `updateInterimStatus`.
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
      freeswitchBLegUuid?: string | null
      current?: WhatsappCallRow
    },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    const { id, status, current, ...data } = props

    let existing = current
    for (let attempt = 0; attempt < 2; attempt++) {
      existing ??= await this.findById(id, tx)
      if (!(existing && canAdvanceStatus(existing.status, status))) {
        return existing?.status === status ? existing : undefined
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
