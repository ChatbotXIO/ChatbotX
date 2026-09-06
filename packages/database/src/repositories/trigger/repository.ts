import { and, count, type DatabaseClient, db, eq, isNull } from "../../client"
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
   * Paginated trigger rows, SQL-builder style — preserves the exact
   * `folderId === null || ""` → `isNull` semantics that triggers use (unlike
   * webhooks, which use `rootFolderId`). Do not unify the two.
   */
  async listPaginated(
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

    const [rows, countResult] = await Promise.all([
      tx
        .select()
        .from(triggerModel)
        .where(whereClause)
        .limit(input.limit)
        .offset(input.offset),
      tx.select({ count: count() }).from(triggerModel).where(whereClause),
    ])

    return { rows, total: countResult[0]?.count ?? 0 }
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
