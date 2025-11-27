"use server"

import { prisma } from "@aha.chat/database"
import { FolderType, type UserModel } from "@aha.chat/database/types"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import {
  type CreateTagBindSchema,
  type CreateTagSchema,
  createTagBindSchema,
  createTagSchema,
} from "../schemas/create-tag-schema"
import { TagException } from "../schemas/error"

export const createTagAction = authActionClient
  .inputSchema(createTagSchema)
  .bindArgsSchemas(createTagBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, folderId],
    }: {
      ctx: { user: UserModel }
      parsedInput: CreateTagSchema
      bindArgsParsedInputs: CreateTagBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingTag = await prisma.tag.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
        },
      })
      if (existingTag) {
        throw new TagException(
          `Tag with the name "${parsedInput.name}" already exists.`,
        )
      }

      if (folderId) {
        await ensureFolderIdIsExists(folderId, chatbotId, FolderType.tag)
      }

      await prisma.tag.create({
        data: {
          ...parsedInput,
          chatbotId,
          folderId,
        },
      })

      revalidateCacheTags(`chatbots:${chatbotId}#tags`)
    },
  )
