"use server"

import { db } from "@chatbotx.io/database/client"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import {
  type CreateSavedReplyRequest,
  createSavedReplyRequest,
} from "../schema/mutation"

export const createSavedReplyAction = authActionClient
  .inputSchema(createSavedReplyRequest)
  .action(
    async ({
      parsedInput,
      ctx,
    }: {
      parsedInput: CreateSavedReplyRequest
      ctx: { user: { id: string } }
    }) => {
      const savedReply = await db
        .insert(savedReplyModel)
        .values({
          id: createId(),
          userId: ctx.user.id,
          shortcut: parsedInput.shortcut,
          text: parsedInput.text,
        })
        .returning()
        .then((result) => result[0])

      revalidateCacheTags(`users:${ctx.user.id}#savedReplies`)

      return savedReply
    },
  )
