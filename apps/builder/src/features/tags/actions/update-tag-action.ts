"use server"

import { prisma } from "@aha.chat/database"
import type { UserModel } from "@aha.chat/database/types"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { TagException } from "../schemas/error"
import {
  type UpdateTagBindSchema,
  type UpdateTagSchema,
  updateTagBindSchema,
  updateTagSchema,
} from "../schemas/update-tag-schema"

export const updateTagAction = authActionClient
  .inputSchema(updateTagSchema)
  .bindArgsSchemas(updateTagBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, tagId],
    }: {
      ctx: { user: UserModel }
      parsedInput: UpdateTagSchema
      bindArgsParsedInputs: UpdateTagBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingTag = await prisma.tag.findFirst({
        select: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
          id: {
            not: tagId,
          },
        },
      })
      if (existingTag) {
        throw new TagException(
          `Tag with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.tag.update({
        where: {
          id: tagId,
        },
        data: {
          name: parsedInput.name,
        },
      })

      revalidateCacheTags(`chatbots:${chatbotId}#tags`)
    },
  )
