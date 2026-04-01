"use server"

import { db, eq } from "@chatbotx.io/database/client"
import { tagModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import {
  type UpdateTagSchema,
  updateTagSchema,
} from "../schemas/update-tag-schema"

export const updateTagAction = authActionClient
  .inputSchema(updateTagSchema)
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      ctx: { user: UserModel }
      parsedInput: UpdateTagSchema
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      await updateTag({ chatbotId, id, parsedInput })
    },
  )

export const updateTag = async ({
  chatbotId,
  id,
  parsedInput,
}: {
  chatbotId: bigint
  id: bigint
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
