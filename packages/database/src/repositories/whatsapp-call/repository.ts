import { and, type DatabaseClient, db, eq } from "../../client"
import type {
  WhatsappCallDirection,
  WhatsappCallStatus,
} from "../../partials/whatsapp-call"
import { whatsappCallModel } from "../../schema"

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
   * row untouched. Safe against duplicate webhook deliveries and races.
   */
  async createIfAbsent(
    input: WhatsappCallUpsertInput,
    tx: DatabaseClient = db,
  ): Promise<WhatsappCallRow> {
    const inserted = await tx
      .insert(whatsappCallModel)
      .values(input)
      .onConflictDoNothing({ target: whatsappCallModel.wacid })
      .returning()
      .then((rows) => rows[0])

    if (inserted) {
      return inserted
    }

    const existing = await this.findByWacid(input.wacid, tx)
    if (!existing) {
      throw new Error(`WhatsappCall upsert race lost for wacid ${input.wacid}`)
    }
    return existing
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
