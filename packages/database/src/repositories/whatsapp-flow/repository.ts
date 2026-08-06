import { and, type DatabaseClient, db, eq, sql } from "../../client"
import { whatsappFlowModel } from "../../schema"

type WhatsappFlowSourceRef = {
  integrationWhatsappId: string
  sourceId: string
}

class WhatsappFlowRepository {
  async incrementCompletedCount(
    input: WhatsappFlowSourceRef,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
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
  }
}

export const whatsappFlowRepository = new WhatsappFlowRepository()
