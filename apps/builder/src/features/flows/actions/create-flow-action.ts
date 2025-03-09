"use server"

import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { chatbotActionClient } from "@/lib/safe-action"
import { FolderType, prisma } from "@ahachat.ai/database"
import { createId } from "@paralleldrive/cuid2"
import { revalidateTag } from "next/cache"
import { MessageType } from "../react-flow/types"
import {
  type CreateFlowSchema,
  createFlowSchema,
} from "../schemas/create-flow-schema"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"

export const createFlowAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(createFlowSchema)
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

      await prisma.flow.create({
        data: {
          ...parsedInput,
          chatbotId,
          flowVersions: {
            create: [
              {
                chatbotId: parsedInput.chatbotId,
                nodes: [
                  {
                    id: createId(),
                    type: "SendMessage",
                    position: { x: 100, y: 100 },
                    data: {
                      id: createId(),
                      name: "Send Message #1",
                      messageType: MessageType.Omnichannel,
                      blocks: [],
                    },
                  },
                ],
                edges: [],
                isDraft: true,
              },
            ],
          },
        },
      })

      revalidateTag(`chatbots:${chatbotId}#flows`)
    },
  )
