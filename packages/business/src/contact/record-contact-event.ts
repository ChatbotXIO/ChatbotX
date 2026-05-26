import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { contactEventModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import type { ContactEventType } from "./contact-event-types"

type RecordContactEventParams = {
  tx?: DatabaseClient
  contactId: string
  workspaceId: string
  eventType: ContactEventType | string
  meta?: Record<string, unknown> | null
  actorUserId?: string | null
}

/**
 * Grava 1 evento de contato na tabela ContactEvent. Fire-and-forget com catch
 * interno — NUNCA derruba a action principal. Espelha o estilo do logAudit().
 *
 * Pode aceitar `tx` quando chamado dentro de uma transaction Drizzle (ex.: durante
 * o merge de contatos, pra registrar o event atomicamente com o merge).
 */
export async function recordContactEvent(
  props: RecordContactEventParams,
): Promise<void> {
  try {
    const {
      tx = db,
      contactId,
      workspaceId,
      eventType,
      meta,
      actorUserId,
    } = props
    await tx.insert(contactEventModel).values({
      id: createId(),
      contactId,
      workspaceId,
      eventType,
      meta: meta ?? null,
      actorUserId: actorUserId ?? null,
    })
  } catch (err) {
    console.error("[contact-event] failed to write", {
      eventType: props.eventType,
      contactId: props.contactId,
      err,
    })
  }
}

/**
 * Versão batch — registra o MESMO event pra vários contatos. Usada em actions
 * bulk (add-tag em 100 contatos de uma vez). Faz 1 INSERT com VALUES múltiplos.
 */
export async function recordContactEventBulk(props: {
  tx?: DatabaseClient
  contactIds: string[]
  workspaceId: string
  eventType: ContactEventType | string
  meta?: Record<string, unknown> | null
  actorUserId?: string | null
}): Promise<void> {
  if (props.contactIds.length === 0) {
    return
  }
  try {
    const {
      tx = db,
      contactIds,
      workspaceId,
      eventType,
      meta,
      actorUserId,
    } = props
    await tx.insert(contactEventModel).values(
      contactIds.map((contactId) => ({
        id: createId(),
        contactId,
        workspaceId,
        eventType,
        meta: meta ?? null,
        actorUserId: actorUserId ?? null,
      })),
    )
  } catch (err) {
    console.error("[contact-event] failed to write bulk", {
      eventType: props.eventType,
      count: props.contactIds.length,
      err,
    })
  }
}
