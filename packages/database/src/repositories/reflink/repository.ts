import { type DatabaseClient, db, relationsFilterToSQL } from "../../client"
import { reflinkModel } from "../../schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "../../utils"

export type ReflinkListInput = {
  workspaceId: string
  keyword?: string | null
  page: number
  perPage: number
  sort?: { id: string; desc: boolean }[] | null
}

const buildWhere = (input: {
  workspaceId: string
  keyword?: string | null
}) => ({
  workspaceId: input.workspaceId,
  type: "refLink" as const,
  ...(input.keyword ? { name: { ilike: likeContains(input.keyword) } } : {}),
})

export const reflinkRepository = {
  async listPaginated(input: ReflinkListInput, tx: DatabaseClient = db) {
    const where = buildWhere(input)
    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(reflinkModel, input)

    return await tx.query.reflinkModel.findMany({
      where,
      orderBy,
      ...pagination,
      with: {
        flow: true,
        customField: true,
      },
    })
  },

  async count(
    input: { workspaceId: string; keyword?: string | null },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const where = buildWhere(input)
    return await tx.$count(
      reflinkModel,
      relationsFilterToSQL(reflinkModel, where),
    )
  },

  async findByIdAndWorkspace(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.reflinkModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId, type: "refLink" },
    })
  },
}
