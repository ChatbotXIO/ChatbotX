"use server"

import {
  auditLogActions,
  contactEventTypes,
  logAudit,
  recordContactEvent,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { and, db, eq } from "@chatbotx.io/database/client"
import {
  conversationClosingNoteModel,
  conversationModel,
} from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import {
  emitConversationArchived,
  emitConversationClosed,
} from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
import { closeConversationWithNoteRequest } from "@/features/closing-notes/schemas/action"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

// Closing Notes Fase C (#15 — 2026-05-27). Fluxo:
//  1. Server valida modo do workspace (mandatoryDialog exige categoryId,
//     mandatoryBoth exige categoryId + summary). Validação UI é só UX —
//     server é source-of-truth pra evitar bypass.
//  2. Insere ConversationClosingNote (1-1 com conversa) se categoryId ou
//     summary vierem preenchidos. Modo "optional" pode pular ambos →
//     comporta-se como archive puro.
//  3. Atualiza archivedAt da conversa.
//  4. Emite eventos (mesma sequência de archiveConversationAction) pra
//     triggers/analytics não regredirem.
export const closeConversationWithNoteAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(closeConversationWithNoteRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx: { user, workspace },
    } = props

    const { conversationId, categoryId, summary } = parsedInput
    const mode = workspace.closingNotesMode

    if (mode === "mandatoryDialog" && !categoryId) {
      throw new ChatbotXException("Categoria é obrigatória.")
    }
    if (mode === "mandatoryBoth" && !(categoryId && summary)) {
      throw new ChatbotXException("Categoria e resumo são obrigatórios.")
    }

    const conversation = await db.query.conversationModel.findFirst({
      where: {
        id: conversationId,
        workspaceId,
      },
    })
    if (!conversation) {
      throw new ChatbotXException("Conversa não encontrada.")
    }

    let categoryName: string | null = null
    if (categoryId) {
      const category = await db.query.conversationCategoryModel.findFirst({
        where: {
          id: categoryId,
          workspaceId,
        },
      })
      if (!category) {
        throw new ChatbotXException("Categoria não encontrada.")
      }
      categoryName = category.name
    }

    const shouldPersistNote = Boolean(categoryId) || Boolean(summary)
    if (shouldPersistNote) {
      // 1-1: unique(conversationId). Se já existir nota (caso reabriu + fechou
      // de novo), apaga a anterior e cria nova — captura intenção atual do
      // atendente, não histórica.
      await db
        .delete(conversationClosingNoteModel)
        .where(eq(conversationClosingNoteModel.conversationId, conversationId))

      await db.insert(conversationClosingNoteModel).values({
        id: createId(),
        workspaceId,
        conversationId,
        categoryId: categoryId ?? null,
        summary: summary ?? null,
        closedByUserId: user.id,
      })
    }

    await db
      .update(conversationModel)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(conversationModel.workspaceId, workspaceId),
          eq(conversationModel.id, conversationId),
        ),
      )

    try {
      await emitConversationArchived(
        workspaceId,
        conversation.contactId,
        conversation.id,
        user.id,
      )
    } catch (error) {
      logger.error(
        { err: error },
        "Falha ao emitir evento conversationArchived:",
      )
    }
    try {
      await emitConversationClosed(
        workspaceId,
        conversation.contactId,
        conversation.id,
        "user",
      )
    } catch (error) {
      logger.error({ err: error }, "Falha ao emitir evento conversationClosed:")
    }

    emit("analytics:dashboard", {
      eventType: "conversation:archived",
      workspaceId,
      conversationId: conversation.id,
      channel: "webchat",
      occurredAt: new Date(),
      metadata: {
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "closeConversationWithNoteAction",
          triggerType: "conversation_archived",
        },
      },
    }).catch((error) => {
      logger.error(
        { err: error },
        "[closeConversationWithNote] Failed to emit analytics",
      )
    })

    if (shouldPersistNote) {
      const detailParts: string[] = []
      if (categoryName) {
        detailParts.push(`categoria "${categoryName}"`)
      }
      if (summary) {
        detailParts.push("com resumo")
      }
      await logAudit({
        workspaceId,
        userId: user.id,
        action: auditLogActions.CONVERSATION_CLOSED_WITH_NOTE,
        detail: `Conversa fechada (${detailParts.join(", ")})`,
      })

      // Timeline do contato (Fase D). Sem await pra não bloquear o
      // archive — recordContactEvent já é fire-and-forget internamente.
      recordContactEvent({
        contactId: conversation.contactId,
        workspaceId,
        eventType: contactEventTypes.CONVERSATION_CLOSED_WITH_NOTE,
        actorUserId: user.id,
        meta: {
          conversationId: conversation.id,
          categoryName,
          summary: summary ?? null,
          closedByUserName: user.name ?? null,
        },
      })
    }

    revalidateCacheTags(`workspaces:${workspaceId}#conversations`)
  })
