"use server"

import { and, db, eq, findOrFail } from "@aha.chat/database/client"
import { sequenceModel } from "@aha.chat/database/schema"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      await findOrFail(
        sequenceModel,
        {
          id,
          chatbotId,
        },
        "Sequence not found",
      )

      await db
        .delete(sequenceModel)
        .where(
          and(eq(sequenceModel.id, id), eq(sequenceModel.chatbotId, chatbotId)),
        )

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])
    },
  )
