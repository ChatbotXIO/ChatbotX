"use server"

import { FolderType, type Prisma, prisma } from "@aha.chat/database"
import { sendMessageNodeDefaultFn } from "@aha.chat/flow-config"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateFlowSchema,
  createFlowSchema,
} from "../schemas/create-flow-schema"

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
        await ensureFolderIdIsExists(
          parsedInput.folderId,
          chatbotId,
          FolderType.flow,
        )
      }

      const defaultNode = sendMessageNodeDefaultFn({
        name: "Send Message #1",
      })

      await prisma.flow.create({
        data: {
          ...parsedInput,
          chatbotId,
          flowVersions: {
            create: [
              {
                chatbotId,
                nodes: [defaultNode as Prisma.InputJsonObject],
                edges: [],
                isDraft: true,
                startNodeId: defaultNode.id,
              },
            ],
          },
        },
      })

      revalidateCacheTags(`chatbots:${chatbotId}#flows`)
    },
  )
