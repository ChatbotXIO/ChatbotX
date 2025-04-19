"use server"

import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { FolderType, type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type CreateTagBindSchema,
  type CreateTagSchema,
  createTagBindSchema,
  createTagSchema,
} from "../schemas/create-tag-schema"
import { TagException } from "../schemas/error"

export const createTagAction = authActionClient
  .schema(createTagSchema)
  .bindArgsSchemas(createTagBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, folderId],
    }: {
      ctx: { user: User }
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
        await ensureFolderIdIsExists(folderId, chatbotId, FolderType.TAG)
      }

      await prisma.tag.create({
        data: {
          ...parsedInput,
          chatbotId,
          folderId,
        },
      })

      revalidateTag(`${ctx.user.id}#tags`)

      return {
        successful: true,
      }
    },
  )
