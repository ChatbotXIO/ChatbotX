"use server"

import {
  badRequestException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import { emitShortcut } from "@chatbotx.io/events"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

const triggerShortcutSchema = z.object({
  conversationId: zodBigintAsString(),
  flowId: zodBigintAsString(),
})
export type TriggerShortcutInput = z.infer<typeof triggerShortcutSchema>

/**
 * Server action que o agente clica no header do Inbox pra disparar um flow
 * com TriggerNode tipo "shortcut" pra um contato específico.
 *
 * Valida:
 *  - Conversa existe no workspace
 *  - Flow está ativo + tem currentVersionId
 *  - Flow tem TriggerNode tipo "shortcut" (não dispara flows "regulares")
 *
 * Emite `emitShortcut` — o `FlowEventDispatcher` no worker matcha o flow
 * exato (`metadata.flowId === flow.id` no filtro de shortcut) e roda.
 */
export const triggerShortcutAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(triggerShortcutSchema)
  .action(async ({ bindArgsParsedInputs, parsedInput, ctx }) => {
    const [workspaceId] = bindArgsParsedInputs
    const { conversationId, flowId } = parsedInput

    const conversation = await db.query.conversationModel.findFirst({
      where: { id: conversationId, workspaceId },
    })
    if (!conversation) {
      throw notFoundException("Conversa não encontrada")
    }

    const flow = await db.query.flowModel.findFirst({
      where: { id: flowId, workspaceId, active: true },
      with: { flowVersion: true },
    })
    if (!(flow?.currentVersionId && flow.flowVersion)) {
      throw notFoundException("Fluxo não encontrado ou inativo")
    }

    const nodes = (flow.flowVersion.nodes ?? []) as Array<{
      type?: string
      data?: { details?: { triggerType?: string } }
    }>
    const triggerNode = nodes.find((n) => n?.type === "trigger")
    const triggerType = triggerNode?.data?.details?.triggerType
    if (triggerType !== "shortcut") {
      throw badRequestException(
        "Este fluxo não é um atalho. Configure o Gatilho do tipo Atalho para usar aqui.",
      )
    }

    try {
      await emitShortcut(
        workspaceId,
        conversation.contactId,
        conversation.id,
        flow.id,
        ctx.user.id,
      )
    } catch (error) {
      logger.error(
        { err: error },
        "[triggerShortcutAction] Falha ao emitir evento shortcut",
      )
      throw badRequestException("Falha ao disparar o atalho")
    }
  })
