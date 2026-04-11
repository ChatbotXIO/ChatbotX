"use server"

import { automatedResponseService } from "@chatbotx.io/automated-response"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { automatedResponseModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateAutomatedResponseRequest,
  updateAutomatedResponseRequest,
} from "../schema/action"

export const updateAutomatedResponseAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAutomatedResponseRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateAutomatedResponse({ workspaceId, id }, parsedInput)
  })

export const updateAutomatedResponse = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: UpdateAutomatedResponseRequest,
) => {
  const automatedResponse = await findOrFail({
    table: automatedResponseModel,
    where: {
      workspaceId: ctx.workspaceId,
      id: ctx.id,
    },
    message: "Automated response not found",
  })

  // validate flow id if text is not provided
  if (parsedInput.text?.length) {
    parsedInput.flowId = undefined
  } else if (parsedInput.flowId) {
    const exists = await db.query.flowModel.findFirst({
      columns: {
        id: true,
      },
      where: {
        id: parsedInput.flowId,
        workspaceId: ctx.workspaceId,
      },
    })
    if (!exists) {
      return returnValidationErrors(updateAutomatedResponseRequest, {
        _errors: ["Validation Exception"],
        flowId: {
          _errors: ["Flow not found"],
        },
      })
    }
    parsedInput.text = null
  }

  await db
    .update(automatedResponseModel)
    .set({
      ...parsedInput,
      keywords: parsedInput.keywords?.map((m) => m.value) ?? [],
    })
    .where(eq(automatedResponseModel.id, automatedResponse.id))

  await automatedResponseService.invalidateCache(ctx.workspaceId)
  revalidateCacheTags(`workspaces:${ctx.workspaceId}#automatedResponses`)
}
