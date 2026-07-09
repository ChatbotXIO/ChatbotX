"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { fbCommentAutomationModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateFbCommentRequest,
  updateFbCommentRequest,
} from "../schema/action"

export const updateFbComment = async (
  ctx: { workspaceId: string; id: string },
  input: UpdateFbCommentRequest,
) => {
  const [record] = await db
    .update(fbCommentAutomationModel)
    .set(input)
    .where(
      and(
        eq(fbCommentAutomationModel.id, ctx.id),
        eq(fbCommentAutomationModel.workspaceId, ctx.workspaceId),
      ),
    )
    .returning()

  return record
}

export const updateFbCommentAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateFbCommentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      parsedInput: UpdateFbCommentRequest
    }) => {
      await updateFbComment({ workspaceId, id }, parsedInput)
    },
  )
