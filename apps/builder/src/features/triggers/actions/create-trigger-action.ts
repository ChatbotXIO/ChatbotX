"use server"

import { FolderType, prisma } from "@aha.chat/database"
import { updateTriggerCache } from "@aha.chat/events"
import { getTranslations } from "next-intl/server"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { chatbotActionClient } from "@/lib/safe-action"
import { MAX_TRIGGERS_PER_CHATBOT } from "../constants"
import {
  type CreateTriggerSchema,
  createTriggerSchema,
} from "../schemas/create-trigger-schema"
import { MaxTriggersReachedException } from "../schemas/exception"

export const createTriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createTriggerSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateTriggerSchema
    }) => {
      const t = await getTranslations()

      const existingTriggersCount = await prisma.trigger.count({
        where: { chatbotId },
      })

      if (existingTriggersCount >= MAX_TRIGGERS_PER_CHATBOT) {
        throw new MaxTriggersReachedException(
          t("validation.maxItemsReached", {
            max: MAX_TRIGGERS_PER_CHATBOT,
            feature: "triggers",
          }),
        )
      }

      if (parsedInput.folderId) {
        await ensureFolderIdIsExists(
          parsedInput.folderId,
          chatbotId,
          FolderType.trigger,
        )
      }

      const { conditions, actions, ...triggerData } = parsedInput

      const result = await prisma.trigger.create({
        data: {
          ...triggerData,
          chatbotId,
          actions,
          triggerConditions: {
            create: conditions.map((c) => ({
              type: c.type,
              sourceId: "sourceId" in c ? c.sourceId : null,
              operator: "operator" in c ? c.operator : null,
              value: "value" in c && c.value !== null ? c.value : undefined,
            })),
          },
        },
        include: {
          triggerConditions: true,
        },
      })

      await updateTriggerCache(chatbotId)

      return result
    },
  )
