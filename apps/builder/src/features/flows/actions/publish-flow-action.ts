"use server"

import {
  badRequestException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import { and, db, eq } from "@chatbotx.io/database/client"
import { flowModel, flowVersionModel } from "@chatbotx.io/database/schema"
import { nodeTypeSchema } from "@chatbotx.io/flow-config"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
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
    throw notFoundException("Fluxo não encontrado")
  }

  const draftVersion = flow.flowVersions[0]
  const validated = publishFlowSchema.parse({
    nodes: draftVersion?.nodes,
    edges: draftVersion?.edges,
  })

  // Validação estilo Respond.io: todo flow precisa ter EXATAMENTE 1 TriggerNode
  // como entry point, com pelo menos 1 edge saindo. Sem isso, o flow não
  // dispara automaticamente — fica órfão.
  const triggerNodes = validated.nodes.filter(
    (n) => n.type === nodeTypeSchema.enum.trigger,
  )
  if (triggerNodes.length === 0) {
    throw badRequestException(
      "O fluxo precisa ter um Gatilho como primeiro bloco. Configure o tipo de evento que dispara o fluxo.",
    )
  }
  if (triggerNodes.length > 1) {
    throw badRequestException(
      "O fluxo só pode ter um Gatilho. Remova os Gatilhos extras antes de publicar.",
    )
  }
  const triggerNode = triggerNodes[0]
  const hasOutEdge = validated.edges.some(
    (e) => e.source === triggerNode.id || e.sourceHandle === triggerNode.id,
  )
  if (!hasOutEdge) {
    throw badRequestException(
      "O Gatilho precisa estar conectado a pelo menos um próximo bloco.",
    )
  }

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
