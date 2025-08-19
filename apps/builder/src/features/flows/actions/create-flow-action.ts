"use server"

import { FolderType, prisma } from "@aha.chat/database"
import { OMNICHANNEL } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateFlowSchema,
  createFlowSchema,
} from "../schemas/create-flow-schema"

export const createFlowAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
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
          FolderType.FLOW,
        )
      }

      const firstNodeId = createId()

      await prisma.flow.create({
        data: {
          ...parsedInput,
          chatbotId,
          flowVersions: {
            create: [
              {
                chatbotId,
                nodes: [
                  {
                    id: firstNodeId,
                    type: "SendMessage",
                    position: { x: 100, y: 100 },
                    data: {
                      id: createId(),
                      name: "Send Message #1",
                      isStartNode: true,
                      inboxType: OMNICHANNEL,
                      steps: [],
                    },
                  },
                ],
                edges: [],
                isDraft: true,
                startNodeId: firstNodeId,
              },
            ],
          },
        },
      })

      revalidateTag(`chatbots:${chatbotId}#flows`)
    },
  )
