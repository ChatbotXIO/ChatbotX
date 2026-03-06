"use server"

import { db } from "@aha.chat/database/client"
import { tagModel } from "@aha.chat/database/schema"
import type { UserModel } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type CreateTagRequest, createTagRequest } from "../schemas/action"

export const createTagAction = authActionClient
  .inputSchema(createTagRequest)
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: UserModel }
      parsedInput: CreateTagRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      await findChatbotOrFail(ctx.user.id, chatbotId)

      return await createTag({ chatbotId, ...parsedInput })
    },
  )

export const createTag = async (
  parsedInput: CreateTagRequest & { chatbotId: string },
) => {
  const existingTag = await db.query.tagModel.findFirst({
    columns: {
      id: true,
    },
    where: {
      name: parsedInput.name,
      chatbotId: parsedInput.chatbotId,
    },
  })
  if (existingTag) {
    throw new Error(`Tag with the name "${parsedInput.name}" already exists.`)
  }

  if (parsedInput.folderId) {
    await ensureFolderIsExists(
      parsedInput.folderId,
      parsedInput.chatbotId,
      "tag",
    )
  }

  const newTag = await db
    .insert(tagModel)
    .values({
      ...parsedInput,
      id: createId(),
    })
    .returning()
    .then((result) => result[0])

  revalidateCacheTags(`chatbots:${parsedInput.chatbotId}#tags`)

  return {
    data: newTag,
  }
}
