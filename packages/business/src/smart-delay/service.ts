import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  lte,
} from "@chatbotx.io/database/client"
import {
  type SmartDelayStatus,
  type SmartDelayType,
  smartDelayStatuses,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import { contactOnSmartDelayModel } from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"

export type SmartDelayRow = Omit<
  typeof contactOnSmartDelayModel.$inferSelect,
  "status" | "type"
> & {
  status: SmartDelayStatus
  type: SmartDelayType
}

const toSmartDelayRow = (
  row: typeof contactOnSmartDelayModel.$inferSelect,
): SmartDelayRow => ({
  ...row,
  status: smartDelayStatuses.parse(row.status),
  type: smartDelayTypes.parse(row.type),
})

class SmartDelayService extends BaseService {
  async create(props: {
    tx?: DatabaseClient
    data: typeof contactOnSmartDelayModel.$inferInsert
  }): Promise<void> {
    const { tx = db, data } = props
    await tx.insert(contactOnSmartDelayModel).values(data)
  }

  async markCompleted(props: {
    tx?: DatabaseClient
    id: string
  }): Promise<void> {
    await this.markStatus({
      tx: props.tx,
      id: props.id,
      status: smartDelayStatuses.enum.completed,
    })
  }

  async markCanceled(props: {
    tx?: DatabaseClient
    id: string
  }): Promise<void> {
    await this.markStatus({
      tx: props.tx,
      id: props.id,
      status: smartDelayStatuses.enum.canceled,
    })
  }

  async findById(props: {
    tx?: DatabaseClient
    id: string
  }): Promise<SmartDelayRow | null> {
    const { tx = db, id } = props
    const row = await tx.query.contactOnSmartDelayModel.findFirst({
      where: { id },
    })
    return row ? toSmartDelayRow(row) : null
  }

  async claimDueRows(props: {
    tx?: DatabaseClient
    windowUntil: Date
  }): Promise<SmartDelayRow[]> {
    const { tx = db, windowUntil } = props
    const rows = await tx
      .update(contactOnSmartDelayModel)
      .set({ status: smartDelayStatuses.enum.completed })
      .where(
        and(
          eq(contactOnSmartDelayModel.status, smartDelayStatuses.enum.pending),
          lte(contactOnSmartDelayModel.triggerAt, windowUntil),
        ),
      )
      .returning()

    return rows.map(toSmartDelayRow)
  }

  async resetToPending(props: {
    tx?: DatabaseClient
    ids: string[]
  }): Promise<void> {
    const { tx = db, ids } = props
    if (ids.length === 0) {
      return
    }

    await tx
      .update(contactOnSmartDelayModel)
      .set({ status: smartDelayStatuses.enum.pending })
      .where(inArray(contactOnSmartDelayModel.id, ids))
  }

  private async markStatus(props: {
    tx?: DatabaseClient
    id: string
    status: SmartDelayStatus
  }): Promise<void> {
    const { tx = db, id, status } = props
    await tx
      .update(contactOnSmartDelayModel)
      .set({ status })
      .where(eq(contactOnSmartDelayModel.id, id))
  }
}

export const smartDelayService = new SmartDelayService()
