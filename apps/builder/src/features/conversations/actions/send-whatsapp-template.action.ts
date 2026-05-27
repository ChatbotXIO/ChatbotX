"use server"

import { db } from "@chatbotx.io/database/client"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { sendWhatsappTemplateRequest } from "../schema/send-whatsapp-template"

// Envia um template HSM aprovado pra uma conversation existente.
// Usado pelo composer do Inbox quando o agente quer enviar template manual —
// principalmente fora da janela de 24h em que mensagem free-form é bloqueada
// pelo Meta. Reusa o worker `sendWhatsappTemplateMessage` que já existe
// (mesmo handler dos broadcasts).
export const sendWhatsappTemplateAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(sendWhatsappTemplateRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
    } = props

    const conversation = await db.query.conversationModel.findFirst({
      where: { id: conversationId, workspaceId },
    })
    if (!conversation) {
      throw new Error("Conversa não encontrada")
    }

    const contactInbox = await db.query.contactInboxModel.findFirst({
      where: {
        contactId: conversation.contactId,
        channel: "whatsapp",
      },
    })
    if (!contactInbox) {
      throw new Error("ContactInbox WhatsApp não encontrado")
    }

    const template = await db.query.whatsappMessageTemplateModel.findFirst({
      where: { id: parsedInput.templateId },
    })
    if (!template) {
      throw new Error("Template não encontrado")
    }
    if (template.status !== "APPROVED") {
      throw new Error("Template não está aprovado pela Meta")
    }

    // Constrói params do template a partir das variáveis preenchidas pelo agente.
    // Cada variable preenche um `{{N}}` do body (N começa em 1).
    const variables = parsedInput.variables ?? []
    const body =
      variables.length > 0
        ? variables.map((text) => ({ type: "text" as const, text }))
        : undefined

    await chatQueue.add(ChatJobAction.sendWhatsappTemplateMessage, {
      type: ChatJobAction.sendWhatsappTemplateMessage,
      data: {
        conversation,
        contactInbox,
        templateId: template.id,
        broadcastId: "",
        templateData: body ? { body } : undefined,
      },
    })
  })
