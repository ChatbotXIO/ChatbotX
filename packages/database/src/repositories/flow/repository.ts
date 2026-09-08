import { type DatabaseClient, db, relationsFilterToSQL } from "../../client"
import { rootFolderId } from "../../partials"
import { flowModel } from "../../schema"
import {
  likeContains,
  parseOrderByAsObject,
  parsePagination,
} from "../../utils"

export type FlowListInput = {
  workspaceId: string
  name?: string | null
  folderId?: string | null
  active?: boolean | null
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
}

const buildWhere = (input: FlowListInput) => ({
  workspaceId: input.workspaceId,
  folderId: input.folderId
    ? // biome-ignore lint/style/noNestedTernary: mirrors the original builder query verbatim
      input.folderId === rootFolderId
      ? { isNull: true as const }
      : input.folderId
    : undefined,
  name: input.name ? { ilike: likeContains(input.name) } : undefined,
  active: input.active === null ? undefined : (input.active ?? undefined),
})

export const flowRepository = {
  /**
   * Paginated flow list with each row's draft + latest version attached.
   * The `with` literal stays inline so Drizzle's relational-query type
   * inference survives into `ListFlowsResponse` — do not hoist it out.
   */
  async listWithVersions(input: FlowListInput, tx: DatabaseClient = db) {
    const where = buildWhere(input)
    const pagination = parsePagination(input)
    const orderBy = parseOrderByAsObject(flowModel, input)

    return await tx.query.flowModel.findMany({
      where,
      orderBy,
      ...pagination,
      with: {
        flowVersions: {
          where: {
            OR: [{ isDraft: true }, { isLatest: true }],
          },
        },
      },
    })
  },

  async count(input: FlowListInput, tx: DatabaseClient = db): Promise<number> {
    const where = buildWhere(input)
    return await tx.$count(flowModel, relationsFilterToSQL(flowModel, where))
  },

  /** Flow detail with all versions — shared by both flow detail pages. */
  async findWithVersions(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.flowModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        id: input.id,
      },
      with: {
        flowVersions: true,
      },
    })
  },

  /** Existence check for a set of flow ids, scoped to the workspace. */
  async listIdsByIds(
    input: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const rows = await tx.query.flowModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        id: { in: input.ids },
      },
      columns: { id: true },
    })
    return rows.map((row) => row.id)
  },
}
