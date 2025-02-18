"use server"

import { ensureUserCanAccessChatbot } from "@/features/chatbot-members/queries"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { authActionClient } from "@/lib/safe-action"
import { FolderType, type User, prisma } from "@ahachat.ai/database"
import { createId } from "@paralleldrive/cuid2"
import { revalidateTag } from "next/cache"
import { MessageType } from "../react-flow/types"
import {
  type CreateFlowSchema,
  createFlowSchema,
} from "../schemas/create-flow-schema"

export const createFlowAction = authActionClient
  .schema(createFlowSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: User }
      parsedInput: CreateFlowSchema
    }) => {
      await ensureUserCanAccessChatbot(ctx.user.id, parsedInput.chatbotId)

      if (parsedInput.folderId) {
        await ensureFolderIdIsExists(
          parsedInput.folderId,
          parsedInput.chatbotId,
          FolderType.Flow,
        )
      }

      await prisma.flow.create({
        data: {
          ...parsedInput,
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

      revalidateTag(`chatbots#${parsedInput.chatbotId}#flows`)
    },
  )
