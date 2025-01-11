"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  type UpdateTagBindSchema,
  type UpdateTagSchema,
  updateTagBindSchema,
  updateTagSchema,
} from "../schemas/update-tag-schema"

export const updateTagAction = authActionClient
  .schema(updateTagSchema)
  .bindArgsSchemas(updateTagBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, tagId],
    }: {
      ctx: { user: User }
      parsedInput: UpdateTagSchema
      bindArgsParsedInputs: UpdateTagBindSchema
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      const existingTag = await prisma.tag.findFirst({
        where: {
          name: parsedInput.name,
          chatbotId,
        },
      })

      if (existingTag) {
        throw new Error(
          `Tag with the name "${parsedInput.name}" already exists.`,
        )
      }

      await prisma.tag.update({
        where: {
          id: tagId,
          chatbotId,
        },
        data: {
          name: parsedInput.name,
        },
      })

      revalidateTag(`${ctx.user.id}#tags`)

      return {
        successful: true,
      }
    },
  )
