"use server"

import { prisma } from "@aha.chat/database"
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
    }) =>
      await prisma.trigger.update({
        where: {
          chatbotId,
          id,
        },
        data: parsedInput,
      }),
  )
