"use server"

import { db } from "@aha.chat/database/client"
import { flowModel, flowVersionModel } from "@aha.chat/database/schema"
import { sendMessageNodeDefaultFn } from "@aha.chat/flow-config"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { type CreateFlowSchema, createFlowSchema } from "../schemas/action"

export const createFlowAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createFlowSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateFlowSchema
    }) => {
      if (parsedInput.folderId) {
        await ensureFolderIsExists(parsedInput.folderId, chatbotId, "flow")
      }

      const defaultNode = sendMessageNodeDefaultFn({
        dataProps: {
          name: "Send Message #1",
          isStartNode: true,
        },
      })

      await db.transaction(async (tx) => {
        const flowId = createId()
        await tx.insert(flowModel).values({
          ...parsedInput,
          id: flowId,
          chatbotId,
        })

        await tx.insert(flowVersionModel).values({
          id: createId(),
          chatbotId,
          flowId,
          nodes: [defaultNode as Record<string, unknown>],
          edges: [],
          isDraft: true,
          startNodeId: defaultNode.id,
        })
      })

      revalidateCacheTags(`chatbots:${chatbotId}#flows`)
    },
  )
