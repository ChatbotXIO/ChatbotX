import { and, type DatabaseClient, db, eq, isNull } from "../../client"
import { triggerModel } from "../../schema"

const buildWhere = (input: {
  workspaceId: string
  folderId?: string | null
  name?: string
}) => {
  const conditions = [eq(triggerModel.workspaceId, input.workspaceId)]

  if (input.folderId !== undefined) {
    const folderId =
      input.folderId === null || input.folderId === "" ? null : input.folderId
    if (folderId === null) {
      conditions.push(isNull(triggerModel.folderId))
    } else {
      conditions.push(eq(triggerModel.folderId, folderId))
    }
  }

  if (input.name) {
    conditions.push(eq(triggerModel.name, input.name))
  }

  return and(...conditions)
}

export const triggerRepository = {
  /**
   * Paginated trigger rows with their real `conditions` joined in, SQL-level
   * — shared by the public API's `GET /v1/triggers` and the builder's
   * triggers page, so both paginate identically instead of the builder
   * hand-rolling a second implementation.
   */
  async listPaginatedWithConditions(
    input: {
      workspaceId: string
      folderId?: string | null
      name?: string
      limit: number
      offset: number
    },
    tx: DatabaseClient = db,
  ) {
    const whereClause = buildWhere(input)

    const relationalFolderId =
      input.folderId === null || input.folderId === ""
        ? { isNull: true as const }
        : input.folderId

    const [rows, total] = await Promise.all([
      tx.query.triggerModel.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(input.folderId === undefined
            ? {}
            : { folderId: relationalFolderId }),
          ...(input.name ? { name: input.name } : {}),
        },
        with: { conditions: true },
        orderBy: { createdAt: "desc", id: "desc" },
        limit: input.limit,
        offset: input.offset,
      }),
      tx.$count(triggerModel, whereClause),
    ])

    return { rows, total }
  },

  async findWithConditions(
    params: { id?: string; workspaceId?: string },
    tx: DatabaseClient = db,
  ) {
    const where: Record<string, unknown> = {}

    if (params.id) {
      where.id = params.id
    }

    if (params.workspaceId) {
      where.workspaceId = params.workspaceId
    }

    if (Object.keys(where).length === 0) {
      return null
    }

    const result = await tx.query.triggerModel.findFirst({
      where,
      with: {
        conditions: true,
      },
    })

    return result ?? null
  },
}
