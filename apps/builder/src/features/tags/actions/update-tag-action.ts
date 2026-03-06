"use server"

import { db, eq } from "@aha.chat/database/client"
import { tagModel } from "@aha.chat/database/schema"
import type { UserModel } from "@aha.chat/database/types"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
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

      const existingTag = await db.query.tagModel.findFirst({
        columns: {
          id: true,
        },
        where: {
          name: parsedInput.name,
          chatbotId,
          id: {
            ne: tagId,
          },
        },
      })
      if (existingTag) {
        throw new Error(
          `Tag with the name "${parsedInput.name}" already exists.`,
        )
      }

      await db
        .update(tagModel)
        .set({
          name: parsedInput.name,
        })
        .where(eq(tagModel.id, tagId))

      revalidateCacheTags(`chatbots:${chatbotId}#tags`)
    },
  )
