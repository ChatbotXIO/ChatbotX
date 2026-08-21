import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  isNotNull,
  isNull,
} from "../../client"
import type {
  WhatsappCallDirection,
  WhatsappCallStatus,
} from "../../partials/whatsapp-call"
import { contactInboxModel, whatsappCallModel } from "../../schema"

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

/**
 * Lifecycle ordering guard: webhook jobs are processed concurrently, so a
 * late RINGING/ACCEPTED can land after the terminate for the same call. A
 * status may only advance to a higher rank — with one deliberate exception:
 * `rejected` may overwrite `failed`, because a declined call terminates as
 * FAILED and the interim REJECTED status can arrive after the terminate job
 * already finalized the row.
 */
const STATUS_RANK: Record<WhatsappCallStatus, number> = {
  ringing: 0,
  accepted: 1,
  rejected: 2,
  failed: 3,
  completed: 4,
}

const canAdvanceStatus = (
  current: WhatsappCallStatus,
  next: WhatsappCallStatus,
): boolean => {
  if (next === "rejected" && current === "failed") {
    return true
  }
  return STATUS_RANK[next] > STATUS_RANK[current]
}

class WhatsappCallRepository {
  async findByWacid(
    wacid: string,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx.query.whatsappCallModel.findFirst({ where: { wacid } })
  }

  /**
   * Creates the call row if the wacid is new; otherwise returns the existing
   * row untouched. Safe against duplicate webhook deliveries and races —
   * `isNew` tells the caller whether ITS insert won, so one-shot side
   * effects (trigger events, ringing broadcasts) fire exactly once.
   */
  async createIfAbsent(
    input: WhatsappCallUpsertInput,
    tx: DatabaseClient = db,
  ): Promise<{ call: WhatsappCallRow; isNew: boolean }> {
    const inserted = await tx
      .insert(whatsappCallModel)
      .values(input)
      .onConflictDoNothing({ target: whatsappCallModel.wacid })
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
    props: { wacid: string; status: WhatsappCallStatus },
    tx: DatabaseClient = db,
  ): Promise<{ previousStatus: WhatsappCallStatus } | undefined> {
    // Retried once: a concurrent writer can invalidate the optimistic WHERE
    // between the read and the update (e.g. terminate finalizing to `failed`
    // right before a REJECTED lands) — the re-read then observes the new
    // status and re-evaluates the transition against it.
    for (let attempt = 0; attempt < 2; attempt++) {
      const existing = await this.findByWacid(props.wacid, tx)
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
    }
    return
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

  async findByLivekitRoomName(
    livekitRoomName: string,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx.query.whatsappCallModel.findFirst({
      where: { livekitRoomName },
      orderBy: { createdAt: "desc" },
    })
  }

  /** Stamps the LiveKit room carrying this call's audio (in-app calling). */
  async attachLivekitRoom(
    props: { wacid: string; livekitRoomName: string },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({ livekitRoomName: props.livekitRoomName })
      .where(eq(whatsappCallModel.wacid, props.wacid))
      .returning()
      .then((rows) => rows[0])
  }

  /**
   * Claims the recording slot exactly once BEFORE the egress is started —
   * LiveKit webhooks are at-least-once, and `recordingPath` is only
   * confirmed at egress end, far too late to guard the start. The CAS on
   * `recordingPath IS NULL` makes a redelivered `participant_joined` a
   * no-op (`undefined` return) so a second egress never spins up.
   */
  async claimRecordingSlot(
    props: { wacid: string; recordingPath: string },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    return await tx
      .update(whatsappCallModel)
      .set({ recordingPath: props.recordingPath })
      .where(
        and(
          eq(whatsappCallModel.wacid, props.wacid),
          isNull(whatsappCallModel.recordingPath),
        ),
      )
      .returning()
      .then((rows) => rows[0])
  }

  /**
   * Rolls a failed egress start back so a later attempt can claim again.
   * Guarded on `recordedAt IS NULL` — once a recording actually finished,
   * the slot is permanent.
   */
  async releaseRecordingSlot(
    props: { wacid: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(whatsappCallModel)
      .set({ recordingPath: null })
      .where(
        and(
          eq(whatsappCallModel.wacid, props.wacid),
          isNull(whatsappCallModel.recordedAt),
        ),
      )
  }

  /**
   * Finalizes the recording exactly once when the egress lands — the CAS on
   * `recordedAt IS NULL` makes a redelivered `egress_ended` a no-op
   * (`undefined` return). `recordingPath` is overwritten with the actual
   * egress output filename, which is authoritative over the claimed path.
   */
  async attachRecording(
    props: { wacid: string; recordingPath: string; recordedAt: Date },
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
          eq(whatsappCallModel.wacid, props.wacid),
          isNull(whatsappCallModel.recordedAt),
        ),
      )
      .returning()
      .then((rows) => rows[0])
  }

  /** Stamps the transcript exactly once (same no-op-on-redelivery contract). */
  async attachTranscript(
    props: { wacid: string; transcript: string; transcribedAt: Date },
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
          eq(whatsappCallModel.wacid, props.wacid),
          isNull(whatsappCallModel.transcript),
        ),
      )
      .returning()
      .then((rows) => rows[0])
  }

  /** Finalizes the call from the Call Terminate webhook. */
  async finalizeByWacid(
    props: {
      wacid: string
      status: WhatsappCallStatus
      startedAt?: Date | null
      endedAt?: Date | null
      durationSeconds?: number | null
      messageId?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow | undefined> {
    const { wacid, ...data } = props
    return await tx
      .update(whatsappCallModel)
      .set(data)
      .where(eq(whatsappCallModel.wacid, wacid))
      .returning()
      .then((rows) => rows[0])
  }
}

export const whatsappCallRepository = new WhatsappCallRepository()
