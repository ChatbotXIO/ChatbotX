"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { flowModel, flowVersionModel } from "@chatbotx.io/database/schema"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { notFoundException } from "@/lib/errors/exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { publishFlowSchema } from "../schemas/action"

export const publishFlowAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await publishFlow({ workspaceId, id })
  })

export const publishFlow = async (ctx: { workspaceId: string; id: string }) => {
  const flow = await db.query.flowModel.findFirst({
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    with: {
      flowVersions: {
        where: {
          isDraft: true,
        },
      },
    },
  })

  if (!flow || flow.flowVersions.length === 0) {
    throw notFoundException("Flow not found")
  }

  const draftVersion = flow.flowVersions[0]
  const validated = publishFlowSchema.parse({
    nodes: draftVersion?.nodes,
    edges: draftVersion?.edges,
  })

  await db.transaction(async (tx) => {
    // Remove all other latest versions
    await tx
      .update(flowVersionModel)
      .set({
        isLatest: false,
      })
      .where(
        and(
          eq(flowVersionModel.flowId, flow.id),
          eq(flowVersionModel.isLatest, true),
        ),
      )

    const newVersionId = createId()
    await tx.insert(flowVersionModel).values({
      id: newVersionId,
      workspaceId: flow.workspaceId,
      flowId: flow.id,
      isDraft: false,
      isLatest: true,
      ...validated,
      startNodeId: draftVersion.startNodeId,
    })

    await tx
      .update(flowModel)
      .set({
        currentVersionId: newVersionId,
      })
      .where(eq(flowModel.id, flow.id))
  })

  revalidateCacheTags([
    `workspaces:${ctx.workspaceId}#flows`,
    `workspaces:${ctx.workspaceId}#flows:${ctx.id}`,
  ])
}
