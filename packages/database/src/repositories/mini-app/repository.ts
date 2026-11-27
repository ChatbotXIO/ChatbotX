import {
  type DatabaseClient,
  db,
  relationsFilterToSQL,
  type SQL,
  type SQLWrapper,
  sql,
} from "../../client"
import { miniAppModel, miniAppSubmissionModel } from "../../schema"
import {
  escapeLikePattern,
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "../../utils"

export type MiniAppListInput = {
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
  ...(input.keyword ? { name: { ilike: likeContains(input.keyword) } } : {}),
})

/**
 * A Mini App never published to WhatsApp (no publication with `publishedAt`).
 * A raw predicate, so it works in `findMany` and in `$count` alike; a published
 * one has a Flow on the creator's number and is not copyable into a template.
 */
export const miniAppNotPublishedRaw = (columns: { id: SQLWrapper }): SQL =>
  sql`NOT EXISTS (
    SELECT 1 FROM "MiniAppPublication"
    WHERE "MiniAppPublication"."miniAppId" = ${columns.id}
      AND "MiniAppPublication"."publishedAt" IS NOT NULL
  )`

export const miniAppRepository = {
  /** The Mini Apps among `ids` that exist in the workspace and are published to WhatsApp (the complement of `miniAppNotPublishedRaw`). One query. */
  async listPublishedNamesByIds(
    input: { workspaceId: string; ids: readonly string[] },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; name: string }[]> {
    if (input.ids.length === 0) {
      return []
    }
    return await tx.query.miniAppModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        id: { in: [...input.ids] },
        RAW: (columns) => sql`NOT (${miniAppNotPublishedRaw(columns)})`,
      },
      columns: { id: true, name: true },
    })
  },

  async listPaginated(input: MiniAppListInput, tx: DatabaseClient = db) {
    return await tx.query.miniAppModel.findMany({
      where: buildWhere(input),
      orderBy: parseOrderByAsObject(miniAppModel, input),
      ...getPaginationWithDefaults(input),
      // The list never needs the (potentially large) definition / Flow JSON.
      columns: { definition: false, flowJson: false },
      with: {
        publications: {
          columns: {
            id: true,
            integrationWhatsappId: true,
            sourceId: true,
            status: true,
            publishedAt: true,
          },
        },
      },
    })
  },

  async count(
    input: { workspaceId: string; keyword?: string | null },
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      miniAppModel,
      relationsFilterToSQL(miniAppModel, buildWhere(input)),
    )
  },

  async findByIdAndWorkspace(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.miniAppModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
      with: { publications: true },
    })
  },

  /** Names in the workspace starting with `prefix` (taken as plain text). */
  async listNamesWithPrefix(
    input: { workspaceId: string; prefix: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const rows = await tx.query.miniAppModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        name: { like: `${escapeLikePattern(input.prefix)}%` },
      },
      columns: { name: true },
    })
    return rows.map((row) => row.name)
  },

  /** Unscoped lookup for the public runner, which only knows the id. */
  async findById(id: string, tx: DatabaseClient = db) {
    return await tx.query.miniAppModel.findFirst({ where: { id } })
  },
}

export type MiniAppSubmissionListInput = {
  workspaceId: string
  miniAppId: string
  page: number
  perPage: number
}

const buildSubmissionWhere = (input: {
  workspaceId: string
  miniAppId: string
}) => ({
  workspaceId: input.workspaceId,
  miniAppId: input.miniAppId,
})

export const miniAppSubmissionRepository = {
  async listPaginated(
    input: MiniAppSubmissionListInput,
    tx: DatabaseClient = db,
  ) {
    return await tx.query.miniAppSubmissionModel.findMany({
      where: buildSubmissionWhere(input),
      orderBy: { createdAt: "desc" },
      ...getPaginationWithDefaults(input),
      with: {
        contact: { columns: { id: true, fullName: true, avatar: true } },
      },
    })
  },

  async count(
    input: { workspaceId: string; miniAppId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      miniAppSubmissionModel,
      relationsFilterToSQL(miniAppSubmissionModel, buildSubmissionWhere(input)),
    )
  },
}
