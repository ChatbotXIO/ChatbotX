import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  isNotNull,
  isNull,
  or,
  sql,
} from "@chatbotx.io/database/client"
import {
  contactModel,
  conversationModel,
  lifecycleStageModel,
} from "@chatbotx.io/database/schema"
import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

class LifecycleStageService extends BaseService {
  protected readonly cachePrefix: string = "lifecycle-stages"

  async listByWorkspaceId(props: {
    tx?: DatabaseClient
    workspaceId: string
  }): Promise<LifecycleStageModel[]> {
    const { tx = db, workspaceId } = props
    const key = `workspaces:${workspaceId}:lifecycle-stages`

    return await withCache(
      key,
      async () =>
        await tx.query.lifecycleStageModel.findMany({
          where: { workspaceId, isActive: true },
          orderBy: { isLost: "asc", position: "asc" },
        }),
      {
        tags: [
          `workspaces:${workspaceId}`,
          `workspaces:${workspaceId}:lifecycle-stages`,
        ],
      },
    )
  }

  async countContactsByStage(props: {
    tx?: DatabaseClient
    workspaceId: string
  }): Promise<Record<string, number>> {
    const { tx = db, workspaceId } = props
    const rows = await tx
      .select({
        stageId: contactModel.lifecycleStageId,
        count: sql<number>`count(*)::int`,
      })
      .from(contactModel)
      .where(eq(contactModel.workspaceId, workspaceId))
      .groupBy(contactModel.lifecycleStageId)

    const result: Record<string, number> = {}
    for (const row of rows) {
      if (row.stageId) {
        result[row.stageId] = row.count
      }
    }
    return result
  }

  // Conta CONVERSAS ABERTAS (archivedAt IS NULL) agrupadas pelo estágio do
  // contato. É esse o badge que aparece ao lado de cada Ciclo de Vida no
  // sidebar do Respond.io (ver docs:
  // markdown-raw/inbox/getting-started-with-inbox.md → "Contagem de conversas
  // abertas indica o número de conversas abertas em uma Caixa de entrada").
  async countOpenConversationsByStage(props: {
    tx?: DatabaseClient
    workspaceId: string
  }): Promise<Record<string, number>> {
    const { tx = db, workspaceId } = props
    const rows = await tx
      .select({
        stageId: contactModel.lifecycleStageId,
        count: sql<number>`count(*)::int`,
      })
      .from(conversationModel)
      .innerJoin(contactModel, eq(conversationModel.contactId, contactModel.id))
      .where(
        and(
          eq(conversationModel.workspaceId, workspaceId),
          isNull(conversationModel.archivedAt),
        ),
      )
      .groupBy(contactModel.lifecycleStageId)

    const result: Record<string, number> = {}
    for (const row of rows) {
      if (row.stageId) {
        result[row.stageId] = row.count
      }
    }
    return result
  }

  // Contagens pros filtros top do sidebar: total / minhas / não atribuídas.
  // Retorna `{ all, mine, unassigned, teams: { [teamId]: count } }`. Conta
  // só conversas ABERTAS (archivedAt IS NULL) — alinhado com Respond.io.
  async countOpenConversationsByAssignment(props: {
    tx?: DatabaseClient
    workspaceId: string
    currentUserId: string
    teamIds?: string[]
  }): Promise<{
    all: number
    mine: number
    unassigned: number
    teams: Record<string, number>
  }> {
    const { tx = db, workspaceId, currentUserId, teamIds = [] } = props
    const baseWhere = and(
      eq(conversationModel.workspaceId, workspaceId),
      isNull(conversationModel.archivedAt),
    )

    // 1 query agrupando por assignedUserId / assignedInboxTeamId — depois
    // somamos no JS pra os totais. Mais eficiente que 4 queries separadas.
    const rows = await tx
      .select({
        assignedUserId: conversationModel.assignedUserId,
        assignedTeamId: conversationModel.assignedInboxTeamId,
        count: sql<number>`count(*)::int`,
      })
      .from(conversationModel)
      .where(baseWhere)
      .groupBy(
        conversationModel.assignedUserId,
        conversationModel.assignedInboxTeamId,
      )

    let all = 0
    let mine = 0
    let unassigned = 0
    const teams: Record<string, number> = {}
    for (const id of teamIds) {
      teams[id] = 0
    }

    for (const row of rows) {
      all += row.count
      if (row.assignedUserId === currentUserId) {
        mine += row.count
      }
      if (!(row.assignedUserId || row.assignedTeamId)) {
        unassigned += row.count
      }
      if (row.assignedTeamId && teams[row.assignedTeamId] !== undefined) {
        teams[row.assignedTeamId] += row.count
      }
    }

    return { all, mine, unassigned, teams }
  }

  // Conta conversas ABERTAS NÃO LIDAS (contactLastReadAt > agentLastReadAt,
  // ou agentLastReadAt IS NULL) por recorte de atribuição. Usado pra
  // indicador "nova mensagem" da sidebar Inbox (bolinha azul que segue
  // prioridade Minhas > Equipe > Não atribuídas > Todas — ver doc
  // markdown-raw/inbox/getting-started-with-inbox.md → "O ponto azul segue
  // esta ordem de prioridade ao marcar novas mensagens").
  async countUnreadByAssignment(props: {
    tx?: DatabaseClient
    workspaceId: string
    currentUserId: string
    teamIds?: string[]
  }): Promise<{
    all: number
    mine: number
    unassigned: number
    teams: Record<string, number>
  }> {
    const { tx = db, workspaceId, currentUserId, teamIds = [] } = props
    const unreadWhere = and(
      eq(conversationModel.workspaceId, workspaceId),
      isNull(conversationModel.archivedAt),
      isNotNull(conversationModel.contactLastReadAt),
      or(
        isNull(conversationModel.agentLastReadAt),
        gt(
          conversationModel.contactLastReadAt,
          conversationModel.agentLastReadAt,
        ),
      ),
    )

    const rows = await tx
      .select({
        assignedUserId: conversationModel.assignedUserId,
        assignedTeamId: conversationModel.assignedInboxTeamId,
        count: sql<number>`count(*)::int`,
      })
      .from(conversationModel)
      .where(unreadWhere)
      .groupBy(
        conversationModel.assignedUserId,
        conversationModel.assignedInboxTeamId,
      )

    let all = 0
    let mine = 0
    let unassigned = 0
    const teams: Record<string, number> = {}
    for (const id of teamIds) {
      teams[id] = 0
    }

    for (const row of rows) {
      all += row.count
      if (row.assignedUserId === currentUserId) {
        mine += row.count
      }
      if (!(row.assignedUserId || row.assignedTeamId)) {
        unassigned += row.count
      }
      if (row.assignedTeamId && teams[row.assignedTeamId] !== undefined) {
        teams[row.assignedTeamId] += row.count
      }
    }

    return { all, mine, unassigned, teams }
  }

  // Igual countUnreadByAssignment mas agrupado por lifecycleStageId do
  // contato. Pra bolinha "nova mensagem" ao lado de cada Ciclo de Vida.
  async countUnreadByStage(props: {
    tx?: DatabaseClient
    workspaceId: string
  }): Promise<Record<string, number>> {
    const { tx = db, workspaceId } = props
    const rows = await tx
      .select({
        stageId: contactModel.lifecycleStageId,
        count: sql<number>`count(*)::int`,
      })
      .from(conversationModel)
      .innerJoin(contactModel, eq(conversationModel.contactId, contactModel.id))
      .where(
        and(
          eq(conversationModel.workspaceId, workspaceId),
          isNull(conversationModel.archivedAt),
          isNotNull(conversationModel.contactLastReadAt),
          or(
            isNull(conversationModel.agentLastReadAt),
            gt(
              conversationModel.contactLastReadAt,
              conversationModel.agentLastReadAt,
            ),
          ),
        ),
      )
      .groupBy(contactModel.lifecycleStageId)

    const result: Record<string, number> = {}
    for (const row of rows) {
      if (row.stageId) {
        result[row.stageId] = row.count
      }
    }
    return result
  }

  async create(props: {
    tx?: DatabaseClient
    workspaceId: string
    data: {
      key: string
      name: string
      icon?: string | null
      color?: string | null
      position: number
      isDefault?: boolean
      isLost?: boolean
    }
  }): Promise<LifecycleStageModel> {
    const { tx = db, workspaceId, data } = props

    // Se vai ser default, primeiro limpa qualquer default ativo
    if (data.isDefault && !data.isLost) {
      await tx
        .update(lifecycleStageModel)
        .set({ isDefault: false })
        .where(
          and(
            eq(lifecycleStageModel.workspaceId, workspaceId),
            eq(lifecycleStageModel.isDefault, true),
          ),
        )
    }

    const [created] = await tx
      .insert(lifecycleStageModel)
      .values({
        id: createId(),
        workspaceId,
        key: data.key,
        name: data.name,
        icon: data.icon ?? null,
        color: data.color ?? null,
        position: data.position,
        isDefault: data.isDefault === true && data.isLost !== true,
        isLost: data.isLost === true,
        isActive: true,
      })
      .returning()

    await this.invalidateCacheTags([
      `workspaces:${workspaceId}`,
      `workspaces:${workspaceId}:lifecycle-stages`,
    ])

    return created
  }

  async update(props: {
    tx?: DatabaseClient
    id: string
    workspaceId: string
    data: Partial<{
      name: string
      icon: string | null
      color: string | null
      description: string | null
      position: number
      isDefault: boolean
      isLost: boolean
    }>
  }): Promise<void> {
    const { tx = db, id, workspaceId, data } = props

    // Se mudar pra default, limpar defaults existentes
    if (data.isDefault === true) {
      await tx
        .update(lifecycleStageModel)
        .set({ isDefault: false })
        .where(
          and(
            eq(lifecycleStageModel.workspaceId, workspaceId),
            eq(lifecycleStageModel.isDefault, true),
          ),
        )
    }

    await tx
      .update(lifecycleStageModel)
      .set(data)
      .where(
        and(
          eq(lifecycleStageModel.id, id),
          eq(lifecycleStageModel.workspaceId, workspaceId),
        ),
      )

    await this.invalidateCacheTags([
      `workspaces:${workspaceId}`,
      `workspaces:${workspaceId}:lifecycle-stages`,
    ])
  }

  async delete(props: {
    tx?: DatabaseClient
    id: string
    workspaceId: string
  }): Promise<void> {
    const { tx = db, id, workspaceId } = props

    await tx
      .delete(lifecycleStageModel)
      .where(
        and(
          eq(lifecycleStageModel.id, id),
          eq(lifecycleStageModel.workspaceId, workspaceId),
        ),
      )

    await this.invalidateCacheTags([
      `workspaces:${workspaceId}`,
      `workspaces:${workspaceId}:lifecycle-stages`,
    ])
  }
}

export const lifecycleStageService = new LifecycleStageService()
