import { type DatabaseClient, db, relationsFilterToSQL } from "../../client"
import { miniAppModel, miniAppSubmissionModel } from "../../schema"
import {
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

export const miniAppRepository = {
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
