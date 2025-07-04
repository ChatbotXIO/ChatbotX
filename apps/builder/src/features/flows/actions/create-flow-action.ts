"use server"

import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { chatbotActionClient } from "@/lib/safe-action"
import { FolderType, prisma } from "@ahachat.ai/database"
import { createId } from "@paralleldrive/cuid2"
import { revalidateTag } from "next/cache"
import {
  type CreateFlowSchema,
  createFlowSchema,
} from "../schemas/create-flow-schema"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { OMNICHANNEL } from "@ahachat.ai/database/types"

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
