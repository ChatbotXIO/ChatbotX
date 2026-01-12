"use server"

import { prisma } from "@aha.chat/database"
import { updateTriggerCache } from "@aha.chat/trigger-events"
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

      return await prisma.$transaction(async (tx) => {
        const existingConditions = await tx.triggerCondition.findMany({
          where: { triggerId: id },
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

        await tx.trigger.update({
          where: { chatbotId, id },
          data: { actions },
        })

        if (conditionsToDelete.length > 0) {
          await tx.triggerCondition.deleteMany({
            where: {
              id: { in: conditionsToDelete.map((c) => c.id) },
            },
          })
        }

        for (const condition of conditionsToUpdate) {
          await tx.triggerCondition.update({
            where: { id: condition.id as string },
            data: {
              type: condition.type,
              sourceId: "sourceId" in condition ? condition.sourceId : null,
              operator: "operator" in condition ? condition.operator : null,
              value:
                "value" in condition && condition.value !== null
                  ? condition.value
                  : undefined,
            },
          })
        }

        if (conditionsToCreate.length > 0) {
          await tx.triggerCondition.createMany({
            data: conditionsToCreate.map((c) => ({
              triggerId: id,
              type: c.type,
              sourceId: "sourceId" in c ? c.sourceId : null,
              operator: "operator" in c ? c.operator : null,
              value: "value" in c && c.value !== null ? c.value : undefined,
            })),
          })
        }

        const result = await tx.trigger.findUnique({
          where: { id },
        })

        if (result) {
          await updateTriggerCache(chatbotId)
        }

        return result
      })
    },
  )
