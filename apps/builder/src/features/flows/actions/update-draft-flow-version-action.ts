"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateDraftFlowVersionSchema,
  updateDraftFlowVersionSchema,
} from "../schemas/action"

export const updateDraftFlowVersionAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateDraftFlowVersionSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateDraftFlowVersionSchema
    }) => {
      const flowVersion = await prisma.flowVersion.findFirstOrThrow({
        where: {
          id,
          chatbotId,
          isDraft: true,
        },
      })

      await prisma.flowVersion.update({
        where: { id: flowVersion.id },
        data: {
          nodes: parsedInput.nodes,
          edges: parsedInput.edges,
        },
      })

      // revalidateCacheTags(`chatbots:${chatbotId}#flows:${id}`)
    },
  )
