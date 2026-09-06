import { createId } from "@chatbotx.io/utils"
import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import { whatsappFlowModel } from "../../schema"

type WhatsappFlowSourceRef = {
  integrationWhatsappId: string
  sourceId: string
}

type WhatsappFlowSyncInput = {
  id: string
  name: string
  status: string
  categories: unknown
  validation_errors: unknown
}

type SyncForIntegrationInput = {
  integrationWhatsappId: string
  flows: WhatsappFlowSyncInput[]
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

  /**
   * Reconciles the locally-cached WhatsApp flows for an integration against
   * the incoming list from Meta: deletes stale flows, updates existing ones,
   * inserts new ones. Pure data reconciliation — no business rules — so when
   * `tx` is omitted it opens its own transaction.
   */
  async syncForIntegration(
    input: SyncForIntegrationInput,
    tx?: DatabaseClient,
  ): Promise<void> {
    const run = async (client: DatabaseClient) => {
      const existingFlows = await client
        .select({
          id: whatsappFlowModel.id,
          sourceId: whatsappFlowModel.sourceId,
        })
        .from(whatsappFlowModel)
        .where(
          eq(
            whatsappFlowModel.integrationWhatsappId,
            input.integrationWhatsappId,
          ),
        )

      const incomingSourceIds = new Set(input.flows.map((flow) => flow.id))

      const flowsToDelete = existingFlows.filter(
        (flow) => !incomingSourceIds.has(flow.sourceId),
      )

      if (flowsToDelete.length > 0) {
        await client.delete(whatsappFlowModel).where(
          inArray(
            whatsappFlowModel.id,
            flowsToDelete.map((flow) => flow.id),
          ),
        )
      }

      for (const flow of input.flows) {
        const existing = existingFlows.find((f) => f.sourceId === flow.id)

        if (existing) {
          await client
            .update(whatsappFlowModel)
            .set({
              name: flow.name,
              status: flow.status,
              categories: flow.categories,
              validationErrors: flow.validation_errors,
            })
            .where(eq(whatsappFlowModel.id, existing.id))
        } else {
          await client.insert(whatsappFlowModel).values([
            {
              id: createId(),
              name: flow.name,
              integrationWhatsappId: input.integrationWhatsappId,
              sourceId: flow.id,
              status: flow.status,
              categories: flow.categories,
              validationErrors: flow.validation_errors,
              completedCount: "0",
            },
          ])
        }
      }
    }

    if (tx) {
      await run(tx)
      return
    }

    await db.transaction(async (transactionClient) => {
      await run(transactionClient)
    })
  }
}

export const whatsappFlowRepository = new WhatsappFlowRepository()
