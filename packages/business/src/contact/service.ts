import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import type { ContactModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"

type FindByProps = {
  id: string
}

/**
 * Result returned by the lifecycle mutation methods. Callers (server actions)
 * use this to emit `lifecycleStageChanged` events into the trigger/webhook
 * queues, keeping the business package free of side-effectful queue imports.
 */
export type LifecycleTransition = {
  contactId: string
  fromStageId: string | null
  toStageId: string | null
  fromStageName: string | null
  toStageName: string | null
}

class ContactService extends BaseService {
  protected readonly cachePrefix: string = "contacts"

  async findBy(props: {
    tx?: DatabaseClient
    where: Partial<FindByProps>
  }): Promise<ContactModel | undefined> {
    const { tx = db, where } = props
    const key = `contacts:${JSON.stringify(where)}`

    return await withCache(
      key,
      async () =>
        await tx.query.contactModel.findFirst({
          where,
        }),
      {
        dynamicTags: (result) => {
          if (result) {
            return [`contacts:${result.id}`]
          }
        },
      },
    )
  }

  /**
   * Helper interno: busca nome de uma stage. Resultado opcional (best-effort
   * pra metadata do evento — não bloqueia a mutação principal).
   */
  private async getStageName(
    tx: DatabaseClient,
    workspaceId: string,
    stageId: string | null,
  ): Promise<string | null> {
    if (!stageId) {
      return null
    }
    const stage = await tx.query.lifecycleStageModel.findFirst({
      where: {
        id: stageId,
        workspaceId,
      },
      columns: { name: true },
    })
    return stage?.name ?? null
  }

  /**
   * Atualiza a etapa de um único contato. Retorna a transição se houve
   * mudança, ou null caso o contato já estivesse na etapa alvo.
   */
  async updateLifecycleStage(props: {
    tx?: DatabaseClient
    contactId: string
    workspaceId: string
    lifecycleStageId: string | null
  }): Promise<LifecycleTransition | null> {
    const { tx = db, contactId, workspaceId, lifecycleStageId } = props

    const previous = await tx.query.contactModel.findFirst({
      where: {
        id: contactId,
        workspaceId,
      },
      columns: { lifecycleStageId: true },
    })
    const fromStageId = previous?.lifecycleStageId ?? null

    await tx
      .update(contactModel)
      .set({ lifecycleStageId })
      .where(
        and(
          eq(contactModel.id, contactId),
          eq(contactModel.workspaceId, workspaceId),
        ),
      )

    await this.invalidateCacheTags([
      `contacts:${contactId}`,
      `workspaces:${workspaceId}`,
      `workspaces:${workspaceId}:lifecycle-stages`,
    ])

    if (fromStageId === lifecycleStageId) {
      return null
    }

    const [fromStageName, toStageName] = await Promise.all([
      this.getStageName(tx, workspaceId, fromStageId),
      this.getStageName(tx, workspaceId, lifecycleStageId),
    ])

    return {
      contactId,
      fromStageId,
      toStageId: lifecycleStageId,
      fromStageName,
      toStageName,
    }
  }

  /**
   * Atualiza a etapa de múltiplos contatos. Retorna o total movido e a lista
   * de transições reais (apenas contatos que de fato mudaram de etapa).
   */
  async bulkUpdateLifecycleStage(props: {
    tx?: DatabaseClient
    contactIds: string[]
    workspaceId: string
    lifecycleStageId: string | null
  }): Promise<{ count: number; transitions: LifecycleTransition[] }> {
    const { tx = db, contactIds, workspaceId, lifecycleStageId } = props
    if (contactIds.length === 0) {
      return { count: 0, transitions: [] }
    }

    const previous = await tx.query.contactModel.findMany({
      where: {
        workspaceId,
        id: { in: contactIds },
      },
      columns: { id: true, lifecycleStageId: true },
    })
    const previousById = new Map<string, string | null>(
      previous.map((c) => [c.id, c.lifecycleStageId ?? null]),
    )

    await tx
      .update(contactModel)
      .set({ lifecycleStageId })
      .where(
        and(
          eq(contactModel.workspaceId, workspaceId),
          inArray(contactModel.id, contactIds),
        ),
      )

    await this.invalidateCacheTags([
      ...contactIds.map((id) => `contacts:${id}`),
      `workspaces:${workspaceId}`,
      `workspaces:${workspaceId}:lifecycle-stages`,
    ])

    const toStageName = await this.getStageName(
      tx,
      workspaceId,
      lifecycleStageId,
    )

    // Cache stage names so we don't repeat the same lookup for every contact
    const stageNameCache = new Map<string, string | null>()
    const cachedStageName = async (id: string | null) => {
      if (!id) {
        return null
      }
      if (stageNameCache.has(id)) {
        return stageNameCache.get(id) ?? null
      }
      const name = await this.getStageName(tx, workspaceId, id)
      stageNameCache.set(id, name)
      return name
    }

    const transitions: LifecycleTransition[] = []
    for (const contactId of contactIds) {
      const fromStageId = previousById.get(contactId) ?? null
      if (fromStageId === lifecycleStageId) {
        continue
      }
      transitions.push({
        contactId,
        fromStageId,
        toStageId: lifecycleStageId,
        fromStageName: await cachedStageName(fromStageId),
        toStageName,
      })
    }

    return { count: contactIds.length, transitions }
  }

  /**
   * Reassigna todos os contatos de uma etapa pra outra (ou pra null).
   * Usado no fluxo de delete de etapa com reassignment.
   * Retorna o total reassignado e a lista de transições.
   */
  async reassignLifecycleStage(props: {
    tx?: DatabaseClient
    workspaceId: string
    fromStageId: string
    toStageId: string | null
  }): Promise<{ count: number; transitions: LifecycleTransition[] }> {
    const { tx = db, workspaceId, fromStageId, toStageId } = props
    const rows = await tx
      .update(contactModel)
      .set({ lifecycleStageId: toStageId })
      .where(
        and(
          eq(contactModel.workspaceId, workspaceId),
          eq(contactModel.lifecycleStageId, fromStageId),
        ),
      )
      .returning({ id: contactModel.id })

    if (rows.length === 0) {
      return { count: 0, transitions: [] }
    }

    await this.invalidateCacheTags([
      ...rows.map((r) => `contacts:${r.id}`),
      `workspaces:${workspaceId}`,
      `workspaces:${workspaceId}:lifecycle-stages`,
    ])

    if (fromStageId === toStageId) {
      return { count: rows.length, transitions: [] }
    }

    const [fromStageName, toStageName] = await Promise.all([
      this.getStageName(tx, workspaceId, fromStageId),
      this.getStageName(tx, workspaceId, toStageId),
    ])

    const transitions: LifecycleTransition[] = rows.map((r) => ({
      contactId: r.id,
      fromStageId,
      toStageId,
      fromStageName,
      toStageName,
    }))

    return { count: rows.length, transitions }
  }

  async countByLifecycleStage(props: {
    tx?: DatabaseClient
    workspaceId: string
    lifecycleStageId: string
  }): Promise<number> {
    const { tx = db, workspaceId, lifecycleStageId } = props
    const rows = await tx
      .select({ id: contactModel.id })
      .from(contactModel)
      .where(
        and(
          eq(contactModel.workspaceId, workspaceId),
          eq(contactModel.lifecycleStageId, lifecycleStageId),
        ),
      )
    return rows.length
  }
}

export const contactService = new ContactService()
