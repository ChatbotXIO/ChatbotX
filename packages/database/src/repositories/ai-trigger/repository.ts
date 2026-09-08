import { type DatabaseClient, db, relationsFilterToSQL } from "../../client"
import { aiTriggerModel } from "../../schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "../../utils"

export type AITriggerListInput = {
  workspaceId: string
  name?: string | null
  page: number
  perPage: number
  sort?: { id: string; desc: boolean }[] | null
}

const buildWhere = (input: { workspaceId: string; name?: string | null }) => ({
  workspaceId: input.workspaceId,
  name: input.name ? { ilike: likeContains(input.name) } : undefined,
})

export const aiTriggerRepository = {
  async listPaginated(input: AITriggerListInput, tx: DatabaseClient = db) {
    const where = buildWhere(input)
    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(aiTriggerModel, input)

    return await tx.query.aiTriggerModel.findMany({
      where,
      orderBy,
      ...pagination,
    })
  },

  async count(
    input: { workspaceId: string; name?: string | null },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const where = buildWhere(input)
    return await tx.$count(
      aiTriggerModel,
      relationsFilterToSQL(aiTriggerModel, where),
    )
  },

  async findByIdAndWorkspace(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.aiTriggerModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
  },
}
