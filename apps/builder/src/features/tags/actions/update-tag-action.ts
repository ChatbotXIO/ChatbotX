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

      await updateTag({ chatbotId, id: tagId, parsedInput })
    },
  )

export const updateTag = async ({
  chatbotId,
  id,
  parsedInput,
}: {
  chatbotId: string
  id: string
  parsedInput: UpdateTagSchema
}) => {
  const existingTag = await db.query.tagModel.findFirst({
    columns: {
      id: true,
    },
    where: {
      name: parsedInput.name,
      chatbotId,
      id: {
        ne: id,
      },
    },
  })
  if (existingTag) {
    throw new Error(`Tag with the name "${parsedInput.name}" already exists.`)
  }

  const updatedTag = await db
    .update(tagModel)
    .set({
      name: parsedInput.name,
    })
    .where(eq(tagModel.id, id))
    .returning()
    .then((result) => result[0])

  revalidateCacheTags(`chatbots:${chatbotId}#tags`)

  return updatedTag
}
