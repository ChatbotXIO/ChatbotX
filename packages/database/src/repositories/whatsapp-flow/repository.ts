import { and, type DatabaseClient, db, eq, sql } from "../../client"
import { whatsappFlowModel } from "../../schema"

type WhatsappFlowSourceRef = {
  integrationWhatsappId: string
  sourceId: string
}

class WhatsappFlowRepository {
  /** Returns the flow's internal id, or null when no such flow row exists. */
  async incrementCompletedCount(
    input: WhatsappFlowSourceRef,
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const [row] = await tx
      .update(whatsappFlowModel)
      .set({
        completedCount: sql`${whatsappFlowModel.completedCount} + 1`,
      })
      .where(
        and(
          eq(
            whatsappFlowModel.integrationWhatsappId,
            input.integrationWhatsappId,
          ),
          eq(whatsappFlowModel.sourceId, input.sourceId),
        ),
      )
      .returning({ id: whatsappFlowModel.id })

    return row?.id ?? null
  }
}

export const whatsappFlowRepository = new WhatsappFlowRepository()
