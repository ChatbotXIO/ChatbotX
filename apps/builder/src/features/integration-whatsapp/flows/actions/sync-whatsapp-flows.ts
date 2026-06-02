"use server"

import { buildContext } from "@chatbotx.io/business"
import { db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import {
  integrationWhatsappModel,
  whatsappFlowModel,
} from "@chatbotx.io/database/schema"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const syncWhatsappFlowsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const integrationWhatsapp = await findOrFail({
      table: integrationWhatsappModel,
      where: {
        workspaceId,
        id,
      },
      message: "Whatsapp integration not found",
    })

    const ctx = await buildContext({
      workspaceId,
      integrationType: "whatsapp",
      integration: {
        ...integrationWhatsapp,
        auth: integrationWhatsapp.auth as WhatsappAuthValue,
      },
    })

    const res = await integrations.whatsapp.runAction("listFlows", {
      ctx,
      params: { limit: 100 },
    })

    await db.transaction(async (tx) => {
      const existingFlows = await tx
        .select({
          id: whatsappFlowModel.id,
          sourceId: whatsappFlowModel.sourceId,
        })
        .from(whatsappFlowModel)
        .where(
          eq(whatsappFlowModel.integrationWhatsappId, integrationWhatsapp.id),
        )

      const incomingSourceIds = new Set(res.data.map((f) => f.id))

      const flowsToDelete = existingFlows.filter(
        (f) => !incomingSourceIds.has(f.sourceId),
      )

      if (flowsToDelete.length > 0) {
        await tx.delete(whatsappFlowModel).where(
          inArray(
            whatsappFlowModel.id,
            flowsToDelete.map((f) => f.id),
          ),
        )
      }

      for (const flow of res.data) {
        const existing = existingFlows.find((f) => f.sourceId === flow.id)

        if (existing) {
          await tx
            .update(whatsappFlowModel)
            .set({
              name: flow.name,
              status: flow.status,
              categories: flow.categories,
              validationErrors: flow.validation_errors,
            })
            .where(eq(whatsappFlowModel.id, existing.id))
        } else {
          await tx.insert(whatsappFlowModel).values([
            {
              id: createId(),
              name: flow.name,
              integrationWhatsappId: integrationWhatsapp.id,
              sourceId: flow.id,
              status: flow.status,
              categories: flow.categories,
              validationErrors: flow.validation_errors,
              completedCount: "0",
            },
          ])
        }
      }
    })

    revalidateCacheTags(`workspaces:${workspaceId}#whatsapp#flows`)
  })
