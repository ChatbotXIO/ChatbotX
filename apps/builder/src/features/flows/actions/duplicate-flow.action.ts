"use server"

import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  flowAnalyticsSessionModel,
  flowModel,
  flowVersionModel,
} from "@chatbotx.io/database/schema"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const duplicateFlowAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await duplicateFlow({ workspaceId, id })
  })

export const duplicateFlow = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const flow = await findOrFail({
    table: flowModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Flow not found",
  })

  const draftVersion = await findOrFail({
    table: flowVersionModel,
    where: {
      flowId: flow.id,
      isDraft: true,
    },
    message: "Draft version not found",
  })

  await db.transaction(async (tx) => {
    const newFlowId = createId()
    await tx.insert(flowModel).values({
      ...flow,
      id: newFlowId,
      name: `${flow.name} _copy`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await tx.insert(flowAnalyticsSessionModel).values({
      flowId: newFlowId,
      workspaceId: flow.workspaceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await tx.insert(flowVersionModel).values({
      ...draftVersion,
      id: createId(),
      flowId: newFlowId,
      isDraft: true,
      startNodeId: draftVersion.startNodeId,
    })
  })

  revalidateCacheTags(`workspaces:${flow.workspaceId}#flows`)
}
