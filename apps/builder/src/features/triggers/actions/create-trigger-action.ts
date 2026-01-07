"use server"

import { FolderType, prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateTriggerSchema,
  createTriggerSchema,
} from "../schemas/create-trigger-schema"

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
      if (parsedInput.folderId) {
        await ensureFolderIdIsExists(
          parsedInput.folderId,
          chatbotId,
          FolderType.trigger,
        )
      }

      const { conditions, actions, ...triggerData } = parsedInput

      return await prisma.trigger.create({
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
    },
  )
