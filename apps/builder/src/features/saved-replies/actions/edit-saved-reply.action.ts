"use server"

import { and, db, eq } from "@aha.chat/database/client"
import { savedReplyModel } from "@aha.chat/database/schema"
import { z } from "zod"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"
import { type EditSavedReplyRequest, editSavedReplyRequest } from "../schema"

const savedReplyIdRequestParams: [z.ZodCUID2] = [z.cuid2().describe("id")]
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
