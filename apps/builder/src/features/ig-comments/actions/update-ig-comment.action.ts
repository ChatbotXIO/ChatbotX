"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { fbCommentAutomationModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateIgCommentRequest,
  updateIgCommentRequest,
} from "../schema/action"

export const updateIgComment = async (
  ctx: { workspaceId: string; id: string },
  input: UpdateIgCommentRequest,
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

export const updateIgCommentAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateIgCommentRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: readonly [string, string]
      parsedInput: UpdateIgCommentRequest
    }) => {
      await updateIgComment({ workspaceId, id }, parsedInput)
    },
  )
