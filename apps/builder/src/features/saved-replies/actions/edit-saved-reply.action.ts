"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { savedReplyModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import type { z } from "zod"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import {
  type EditSavedReplyRequest,
  editSavedReplyRequest,
} from "../schema/mutation"

const savedReplyIdRequestParams: [z.ZodString] = [zodBigintAsString()]
type SavedReplyIdRequestParams = [string]

export const editSavedReplyAction = authActionClient
  .bindArgsSchemas(savedReplyIdRequestParams)
  .inputSchema(editSavedReplyRequest)
  .action(
    async ({
      bindArgsParsedInputs: [id],
      parsedInput,
      ctx,
    }: {
      bindArgsParsedInputs: SavedReplyIdRequestParams
      parsedInput: EditSavedReplyRequest
      ctx: { user: { id: string } }
    }) => {
      const savedReply = await db
        .update(savedReplyModel)
        .set({
          shortcut: parsedInput.shortcut,
          text: parsedInput.text,
        })
        .where(
          and(
            eq(savedReplyModel.id, id),
            eq(savedReplyModel.userId, ctx.user.id),
          ),
        )
        .returning({
          id: savedReplyModel.id,
          shortcut: savedReplyModel.shortcut,
          text: savedReplyModel.text,
        })
        .then((result) => result[0])

      revalidateCacheTags(`users:${ctx.user.id}#savedReplies`)

      return savedReply
    },
  )
