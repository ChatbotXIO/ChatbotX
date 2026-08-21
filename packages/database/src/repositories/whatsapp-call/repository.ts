import { and, type DatabaseClient, db, eq, notInArray } from "../../client"
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
 * Statuses that must never be overwritten by an interim status update —
 * webhook jobs are processed concurrently, so a late RINGING/ACCEPTED status
 * can land after the terminate event for the same call.
 */
const TERMINAL_STATUSES: WhatsappCallStatus[] = ["completed", "failed"]

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
   * Advances the call to an interim status (ringing/accepted/rejected).
   * A no-op when the call already reached a terminal status.
   */
  async updateInterimStatus(
    props: { wacid: string; status: WhatsappCallStatus },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(whatsappCallModel)
      .set({ status: props.status })
      .where(
        and(
          eq(whatsappCallModel.wacid, props.wacid),
          notInArray(whatsappCallModel.status, TERMINAL_STATUSES),
        ),
      )
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
