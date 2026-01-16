"use server"

import { and, db, eq, inArray } from "@aha.chat/database/client"
import { conditionModel, triggerModel } from "@aha.chat/database/schema"
import { updateTriggerCache } from "@aha.chat/events"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateTriggerSchema,
  updateTriggerSchema,
} from "../schemas/update-trigger-schema"

export const updateTriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateTriggerSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateTriggerSchema
    }) => {
      const { conditions, actions } = parsedInput

      const result = await db.transaction(async (tx) => {
        const existingConditions = await tx.query.conditionModel.findMany({
          where: {
            triggerId: id,
          },
        })

        const existingIds = new Set(existingConditions.map((c) => c.id))
        const submittedIds = new Set(
          conditions
            .filter((c) => "id" in c && c.id)
            .map((c) => c.id as string),
        )

        const conditionsToDelete = existingConditions.filter(
          (existing) => !submittedIds.has(existing.id),
        )

        const conditionsToUpdate = conditions.filter(
          (c) => "id" in c && c.id && existingIds.has(c.id as string),
        )

        const conditionsToCreate = conditions.filter(
          (c) => !("id" in c && c.id),
        )

        await tx
          .update(triggerModel)
          .set({ actions })
          .where(
            and(eq(triggerModel.chatbotId, chatbotId), eq(triggerModel.id, id)),
          )

        if (conditionsToDelete.length > 0) {
          await tx.delete(conditionModel).where(
            inArray(
              conditionModel.id,
              conditionsToDelete.map((c) => c.id),
            ),
          )
        }

        for (const condition of conditionsToUpdate) {
          await tx
            .update(conditionModel)
            .set({
              type: condition.type,
              sourceId: "sourceId" in condition ? condition.sourceId : null,
              operator: "operator" in condition ? condition.operator : null,
              value:
                "value" in condition && condition.value !== null
                  ? condition.value
                  : null,
            })
            .where(eq(conditionModel.id, condition.id as string))
        }

        if (conditionsToCreate.length > 0) {
          await tx.insert(conditionModel).values(
            conditionsToCreate.map((c) => ({
              id: createId(),
              triggerId: id,
              type: c.type,
              sourceId: "sourceId" in c ? c.sourceId : null,
              operator: "operator" in c ? c.operator : null,
              value: "value" in c && c.value !== null ? c.value : null,
            })),
          )
        }

        return await tx.query.triggerModel.findFirst({
          where: {
            id,
          },
        })
      })

      await updateTriggerCache(chatbotId)

      return result
    },
  )
