"use server"

import { and, db, eq, findOrFail, inArray } from "@aha.chat/database/client"
import { tagModel } from "@aha.chat/database/schema"
import type { TagModel } from "@aha.chat/database/types"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteTagAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await deleteTags({ chatbotId, ids: parsedInput.ids })
    },
  )

export const deleteTags = async ({
  chatbotId,
  ids,
}: {
  chatbotId: string
  ids: string[]
}) => {
  await db
    .delete(tagModel)
    .where(and(eq(tagModel.chatbotId, chatbotId), inArray(tagModel.id, ids)))

  revalidateCacheTags(`chatbots:${chatbotId}#tags`)
}

export const deleteTag = async ({
  chatbotId,
  id,
}: {
  chatbotId: string
  id: string
}) => {
  const tag = await findOrFail<TagModel>(
    tagModel,
    {
      chatbotId,
      id,
    },
    "Tag not found",
  )

  await db.delete(tagModel).where(eq(tagModel.id, tag.id))

  revalidateCacheTags(`chatbots:${chatbotId}#tags`)
}
