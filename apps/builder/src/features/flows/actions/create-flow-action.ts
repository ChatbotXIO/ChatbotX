"use server"

import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { FolderType, type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type CreateFlowBindSchema,
  type CreateFlowSchema,
  createFlowBindSchema,
  createFlowSchema,
} from "../schemas/create-flow-schema"

export const createFlowAction = authActionClient
  .schema(createFlowSchema)
  .bindArgsSchemas(createFlowBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, folderId],
    }: {
      ctx: { user: User }
      parsedInput: CreateFlowSchema
      bindArgsParsedInputs: CreateFlowBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      if (folderId) {
        await ensureFolderIdIsExists(folderId, chatbotId, FolderType.Flow)
      }

      await prisma.flow.create({
        data: {
          ...parsedInput,
          userId: ctx.user.id,
          chatbotId,
          folderId,
          flowVersions: {
            create: [
              {
                chatbotId,
                nodes: [],
                edges: [],
              },
            ],
          },
        },
        include: {
          flowVersions: true,
        },
      })

      revalidateTag(`${chatbotId}#flows`)

      return {
        successful: true,
      }
    },
  )
