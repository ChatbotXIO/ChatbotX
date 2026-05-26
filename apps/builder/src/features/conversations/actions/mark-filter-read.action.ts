"use server"

import { and, db, eq, inArray, isNull } from "@chatbotx.io/database/client"
import { contactModel, conversationModel } from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type MarkFilterReadRequest,
  markFilterReadRequest,
} from "../schema/mark-filter-read"

// Marca como lidas todas as conversas ABERTAS num recorte (filtro top ou
// lifecycle stage). Usado quando user clica num filtro da sidebar Inbox —
// faz a bolinha "nova mensagem" sumir (doc Respond.io
// markdown-raw/inbox/getting-started-with-inbox.md → "Ao abrir a caixa de
// entrada, o ponto azul desaparece"). Não some até clicar — fica até nova
// msg incoming bater contactLastReadAt.
//
// Conversas individuais ainda mostram unread por conversa na lista até
// serem abertas (readConversationAction continua valendo).
//
// Schema plano (não discriminatedUnion) — Next 16 standalone tem quirk
// com discriminatedUnion em "use server" files.
export const markFilterReadAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(markFilterReadRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: MarkFilterReadRequest
    }) => {
      const baseWhere = and(
        eq(conversationModel.workspaceId, workspaceId),
        isNull(conversationModel.archivedAt),
      )

      if (parsedInput.scope === "all") {
        await db
          .update(conversationModel)
          .set({ agentLastReadAt: new Date() })
          .where(baseWhere)
        return
      }
      if (parsedInput.scope === "mine" && parsedInput.userId) {
        await db
          .update(conversationModel)
          .set({ agentLastReadAt: new Date() })
          .where(
            and(
              baseWhere,
              eq(conversationModel.assignedUserId, parsedInput.userId),
            ),
          )
        return
      }
      if (parsedInput.scope === "unassigned") {
        await db
          .update(conversationModel)
          .set({ agentLastReadAt: new Date() })
          .where(
            and(
              baseWhere,
              isNull(conversationModel.assignedUserId),
              isNull(conversationModel.assignedInboxTeamId),
            ),
          )
        return
      }
      if (parsedInput.scope === "team" && parsedInput.teamId) {
        await db
          .update(conversationModel)
          .set({ agentLastReadAt: new Date() })
          .where(
            and(
              baseWhere,
              eq(conversationModel.assignedInboxTeamId, parsedInput.teamId),
            ),
          )
        return
      }
      if (parsedInput.scope === "lifecycle" && parsedInput.stageId) {
        const contactRows = await db
          .select({ id: contactModel.id })
          .from(contactModel)
          .where(
            and(
              eq(contactModel.workspaceId, workspaceId),
              eq(contactModel.lifecycleStageId, parsedInput.stageId),
            ),
          )
        const contactIds = contactRows.map((r) => r.id)
        if (contactIds.length === 0) {
          return
        }
        await db
          .update(conversationModel)
          .set({ agentLastReadAt: new Date() })
          .where(
            and(baseWhere, inArray(conversationModel.contactId, contactIds)),
          )
      }
    },
  )
