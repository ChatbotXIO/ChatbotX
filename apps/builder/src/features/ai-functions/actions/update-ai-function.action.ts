"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiFunctionModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateAIFunctionRequest,
  updateAIFunctionRequest,
} from "../schema/action"

export const updateAIFunctionAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAIFunctionRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateAIFunction({ workspaceId, id }, parsedInput)
  })

export const updateAIFunction = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: UpdateAIFunctionRequest,
) => {
  const aiFunction = await findOrFail({
    table: aiFunctionModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: `AIFunction with id ${ctx.id} not found`,
  })

  await db
    .update(aiFunctionModel)
    .set(parsedInput)
    .where(eq(aiFunctionModel.id, aiFunction.id))

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#aiFunctions`)
}
