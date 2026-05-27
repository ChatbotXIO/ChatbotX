"use server"

import {
  auditLogActions,
  contactEventTypes,
  logAudit,
  recordContactEvent,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { and, db, eq, inArray, isNotNull } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { unmergeContactsRequest } from "../schemas/unmerge"

/**
 * Desfaz uma fusão de contatos (#17 — 2026-05-27).
 *
 * Estratégia: limpa mergedIntoId/mergedAt/mergedByUserId dos duplicates.
 * Contatos voltam a aparecer na listagem normal.
 *
 * NÃO reverte movimentos feitos no momento do merge:
 *   - Conversations que foram movidas continuam no primary
 *   - Tags que foram movidas continuam no primary
 *   - Custom fields que foram movidos continuam no primary
 *
 * UI deve avisar o usuário disso. Reversão 100% automática exige snapshot
 * pré-merge (debt list pra Fase 2).
 *
 * Validações:
 *   - Todos os duplicateIds devem ter mergedIntoId = primaryId (não pode
 *     unmergear contato que foi fundido em OUTRO primary).
 *   - primaryId e duplicateIds pertencem ao workspace.
 */
export const unmergeContactsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(unmergeContactsRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx: { user },
    } = props
    const { primaryId, duplicateIds } = parsedInput

    if (duplicateIds.includes(primaryId)) {
      throw new ChatbotXException(
        "primaryId não pode estar na lista de duplicates.",
      )
    }

    // Valida: todos os duplicates existem no workspace E estão fundidos
    // no primary informado (evita unmerge cruzado entre primaries).
    const duplicates = await db.query.contactModel.findMany({
      where: {
        workspaceId,
        id: { in: duplicateIds },
        mergedIntoId: primaryId,
      },
      columns: { id: true },
    })
    if (duplicates.length !== duplicateIds.length) {
      throw new ChatbotXException(
        `Alguns contatos não estão fundidos neste primary (esperado ${duplicateIds.length}, encontrado ${duplicates.length}).`,
      )
    }

    await db
      .update(contactModel)
      .set({
        mergedIntoId: null,
        mergedAt: null,
        mergedByUserId: null,
      })
      .where(
        and(
          eq(contactModel.workspaceId, workspaceId),
          inArray(contactModel.id, duplicateIds),
          // Defesa em profundidade — espelha o filtro acima.
          isNotNull(contactModel.mergedIntoId),
        ),
      )

    await logAudit({
      workspaceId,
      userId: user.id,
      action: auditLogActions.CONTACT_UNMERGED,
      detail: `Contato ${primaryId} teve ${duplicateIds.length} fusão(ões) desfeita(s): ${duplicateIds.join(", ")}`,
    })

    // Registra no PRIMARY (não nos duplicates restaurados) — o primary
    // é o "agregador" do histórico de merges, igual o evento MERGED faz.
    recordContactEvent({
      contactId: primaryId,
      workspaceId,
      eventType: contactEventTypes.UNMERGED,
      actorUserId: user.id,
      meta: {
        unmergedIds: duplicateIds,
        unmergedCount: duplicateIds.length,
      },
    })

    revalidateCacheTags([
      `workspaces:${workspaceId}#contacts`,
      `workspaces:${workspaceId}#conversations`,
    ])

    return {
      primaryId,
      unmergedCount: duplicateIds.length,
      unmergedIds: duplicateIds,
    }
  })
