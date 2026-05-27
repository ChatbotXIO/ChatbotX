import { and, db, eq, inArray, notInArray } from "@chatbotx.io/database/client"
import {
  contactCustomFieldModel,
  contactInboxModel,
  contactModel,
  contactNoteModel,
  contactsOnBroadcastsModel,
  contactsOnSequenceModel,
  contactsToTagsModel,
  conversationModel,
  errorLogModel,
} from "@chatbotx.io/database/schema"
import { contactEventTypes } from "./contact-event-types"
import { recordContactEvent } from "./record-contact-event"

type MergeContactsParams = {
  workspaceId: string
  primaryId: string
  duplicateIds: string[]
  actorUserId?: string | null
}

type MergeContactsResult = {
  primaryId: string
  mergedCount: number
  mergedIds: string[]
}

/**
 * Mescla N contatos duplicados sob 1 contato primary.
 *
 * Estratégia (transaction única pra atomicidade):
 *  1. Validar primary + duplicates existem no workspace
 *  2. Mover tags do duplicate → primary (ON CONFLICT DO NOTHING evita dupes)
 *  3. Mover custom fields do duplicate → primary (só copia o que primary ainda
 *     não tem — primary tem preferência sobre duplicates)
 *  4. Mover conversation, contactInbox, contactNote, sequences, broadcasts,
 *     errorLogs do duplicate → primary (UPDATE direto, sem unique constraints
 *     problemáticas nessas tabelas)
 *  5. Soft-delete dos duplicates (#17): UPDATE Contact SET mergedIntoId =
 *     primaryId, mergedAt = NOW, mergedByUserId. Não DELETE — permite
 *     unmerge restaurando os 3 campos pra NULL.
 *  6. Grava ContactEvent MERGED no primary com meta {mergedIds, mergedCount}
 *
 * Validações:
 *  - primaryId NÃO pode estar em duplicateIds (evita auto-merge)
 *  - todos os IDs devem pertencer ao mesmo workspace
 *  - mínimo 1 duplicate
 *
 * Nota Camada 2 pendência: este service ainda não copia "campos sobreescritos"
 * do duplicate pro primary (ex.: se duplicate tem email e primary não tem,
 * deveria preencher primary com o email do duplicate). Versão MVP — Pedro pediu
 * "primary tem preferência" no plano. Refinar quando UI de preview merge for
 * implementada (Fase 5).
 */
export async function mergeContacts(
  props: MergeContactsParams,
): Promise<MergeContactsResult> {
  const { workspaceId, primaryId, duplicateIds, actorUserId } = props

  if (duplicateIds.length === 0) {
    throw new Error("mergeContacts: duplicateIds must have at least 1 entry")
  }
  if (duplicateIds.includes(primaryId)) {
    throw new Error("mergeContacts: primaryId cannot be in duplicateIds")
  }

  const allIds = [primaryId, ...duplicateIds]

  await db.transaction(async (tx) => {
    // 1. Validação: todos os IDs existem no workspace
    const found = await tx.query.contactModel.findMany({
      where: { workspaceId, id: { in: allIds } },
      columns: { id: true },
    })
    if (found.length !== allIds.length) {
      throw new Error(
        `mergeContacts: some contacts not found in workspace (expected ${allIds.length}, found ${found.length})`,
      )
    }

    // 2. Mover tags do duplicate → primary. Estratégia: insert no primary
    //    pra cada tag dos duplicates que ainda não está no primary, depois
    //    delete linhas dos duplicates.
    const duplicateTags = await tx.query.contactsToTagsModel.findMany({
      where: { contactId: { in: duplicateIds } },
      columns: { tagId: true },
    })
    const uniqueTagIds = Array.from(new Set(duplicateTags.map((t) => t.tagId)))
    if (uniqueTagIds.length > 0) {
      await tx
        .insert(contactsToTagsModel)
        .values(uniqueTagIds.map((tagId) => ({ contactId: primaryId, tagId })))
        .onConflictDoNothing({
          target: [contactsToTagsModel.contactId, contactsToTagsModel.tagId],
        })
    }
    await tx
      .delete(contactsToTagsModel)
      .where(inArray(contactsToTagsModel.contactId, duplicateIds))

    // 3. Mover custom fields — só copia o que primary AINDA não tem
    const primaryFields = await tx.query.contactCustomFieldModel.findMany({
      where: { contactId: primaryId },
      columns: { customFieldId: true },
    })
    const primaryFieldIds = new Set(primaryFields.map((f) => f.customFieldId))

    const duplicateFields = await tx.query.contactCustomFieldModel.findMany({
      where: { contactId: { in: duplicateIds } },
    })
    const seenInThisLoop = new Set<string>()
    for (const f of duplicateFields) {
      if (primaryFieldIds.has(f.customFieldId)) {
        continue
      }
      if (seenInThisLoop.has(f.customFieldId)) {
        continue
      }
      seenInThisLoop.add(f.customFieldId)
      await tx
        .insert(contactCustomFieldModel)
        .values({
          contactId: primaryId,
          customFieldId: f.customFieldId,
          value: f.value,
        })
        .onConflictDoNothing({
          target: [
            contactCustomFieldModel.contactId,
            contactCustomFieldModel.customFieldId,
          ],
        })
    }
    await tx
      .delete(contactCustomFieldModel)
      .where(inArray(contactCustomFieldModel.contactId, duplicateIds))

    // 4. Mover conversation, contactInbox, contactNote, sequences, broadcasts,
    //    errorLogs (UPDATE direto — não têm unique constraint problemática).
    await tx
      .update(conversationModel)
      .set({ contactId: primaryId })
      .where(inArray(conversationModel.contactId, duplicateIds))

    await tx
      .update(contactInboxModel)
      .set({ contactId: primaryId })
      .where(inArray(contactInboxModel.contactId, duplicateIds))

    await tx
      .update(contactNoteModel)
      .set({ contactId: primaryId })
      .where(inArray(contactNoteModel.contactId, duplicateIds))

    await tx
      .update(contactsOnSequenceModel)
      .set({ contactId: primaryId })
      .where(inArray(contactsOnSequenceModel.contactId, duplicateIds))

    await tx
      .update(contactsOnBroadcastsModel)
      .set({ contactId: primaryId })
      .where(inArray(contactsOnBroadcastsModel.contactId, duplicateIds))

    await tx
      .update(errorLogModel)
      .set({ contactId: primaryId })
      .where(
        and(
          inArray(errorLogModel.contactId, duplicateIds),
          // protege caso o errorLog.contactId seja nullable em algum row
          notInArray(errorLogModel.contactId, []),
        ),
      )

    // 5. Soft-delete dos duplicates (#17 Unmerge). Em vez de DELETE,
    //    marca mergedIntoId+mergedAt+mergedByUserId. Todas as queries
    //    de listagem filtram mergedIntoId IS NULL → duplicates somem da
    //    UI mas continuam no banco pra reversão.
    await tx
      .update(contactModel)
      .set({
        mergedIntoId: primaryId,
        mergedAt: new Date(),
        mergedByUserId: actorUserId ?? null,
      })
      .where(
        and(
          inArray(contactModel.id, duplicateIds),
          eq(contactModel.workspaceId, workspaceId),
        ),
      )
  })

  // 6. Registra event no primary (fora da transaction — fire-and-forget)
  await recordContactEvent({
    contactId: primaryId,
    workspaceId,
    eventType: contactEventTypes.MERGED,
    meta: {
      mergedIds: duplicateIds,
      mergedCount: duplicateIds.length,
    },
    actorUserId: actorUserId ?? null,
  })

  return {
    primaryId,
    mergedCount: duplicateIds.length,
    mergedIds: duplicateIds,
  }
}
