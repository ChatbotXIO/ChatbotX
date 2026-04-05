"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { flowVersionModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateDraftFlowVersionSchema,
  updateDraftFlowVersionSchema,
} from "../schemas/action"

export const updateDraftFlowVersionAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateDraftFlowVersionSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await updateDraftFlowVersion({ workspaceId, id }, parsedInput)
  })

export const updateDraftFlowVersion = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: UpdateDraftFlowVersionSchema,
) => {
  const flowVersion = await findOrFail({
    table: flowVersionModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
      isDraft: true,
    },
    message: "Draft flow version not found",
  })

  await db
    .update(flowVersionModel)
    .set({
      nodes: parsedInput.nodes,
      edges: parsedInput.edges,
    })
    .where(eq(flowVersionModel.id, flowVersion.id))

  // revalidateCacheTags(`workspaces:${ctx.workspaceId}#flows:${ctx.id}`)
}
