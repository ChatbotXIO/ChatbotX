"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateWebhookSchema,
  updateWebhookSchema,
} from "../schemas/update-webhook-schema"

export const updateWebhookAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateWebhookSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateWebhookSchema
    }) => {
      const { conditions, url } = parsedInput

      return await prisma.$transaction(async (tx) => {
        const existingConditions = await tx.condition.findMany({
          where: { webhookId: id },
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

        await tx.webhook.update({
          where: { chatbotId, id },
          data: { url },
        })

        if (conditionsToDelete.length > 0) {
          await tx.condition.deleteMany({
            where: {
              id: { in: conditionsToDelete.map((c) => c.id) },
            },
          })
        }

        for (const condition of conditionsToUpdate) {
          await tx.condition.update({
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
          await tx.condition.createMany({
            data: conditionsToCreate.map((c) => ({
              webhookId: id,
              type: c.type,
              sourceId: "sourceId" in c ? c.sourceId : null,
              operator: "operator" in c ? c.operator : null,
              value: "value" in c && c.value !== null ? c.value : undefined,
            })),
          })
        }

        const result = await tx.webhook.findUnique({
          where: { id },
        })

        return result
      })
    },
  )
