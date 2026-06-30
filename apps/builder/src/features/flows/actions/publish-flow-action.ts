"use server"

import { flowVersionService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { and, db, eq } from "@chatbotx.io/database/client"
import { flowModel, flowVersionModel } from "@chatbotx.io/database/schema"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { type PublishFlowSchema, publishFlowSchema } from "../schemas/action"

export const publishFlowAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(publishFlowSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await publishFlow({ workspaceId, id }, parsedInput)
  })

export const publishFlow = async (
  ctx: { workspaceId: string; id: string },
  input: PublishFlowSchema,
) => {
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
  const validated = publishFlowSchema.parse(input)

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

    await tx
      .update(flowVersionModel)
      .set({
        nodes: validated.nodes,
        edges: validated.edges,
      })
      .where(eq(flowVersionModel.id, draftVersion.id))

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

  await flowVersionService.invalidateList(flow.id)
}
