import {
  and,
  type DatabaseClient,
  db,
  eq,
  findOrFail,
  inArray,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { spreadsheetModel } from "@chatbotx.io/database/schema"
import type { SpreadsheetModel } from "@chatbotx.io/database/types"
import { likeContains, parsePagination } from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

type CreateSpreadsheetData = Omit<
  typeof spreadsheetModel.$inferInsert,
  "id" | "workspaceId" | "spreadsheetId"
>

type ListSpreadsheetsInput = {
  workspaceId: string
  page?: number
  perPage?: number
  name?: string | null
}

type ListSpreadsheetsResult = {
  data: SpreadsheetModel[]
  pageCount: number
}

class SpreadsheetService extends BaseService {
  async findByWorkspaceIdOrFail(input: {
    id: string
    workspaceId: string
  }): Promise<SpreadsheetModel> {
    return await findOrFail({
      table: spreadsheetModel,
      where: input,
      message: "Spreadsheet not found",
    })
  }

  async create(input: {
    workspaceId: string
    spreadsheetId: string
    data: CreateSpreadsheetData
    tx?: DatabaseClient
  }): Promise<{ id: string }> {
    const { tx = db, workspaceId, spreadsheetId, data } = input
    const id = createId()
    await tx.insert(spreadsheetModel).values({
      ...data,
      id,
      workspaceId,
      spreadsheetId,
    })
    return { id }
  }

  async update(input: {
    workspaceId: string
    id: string
    spreadsheetId: string
    data: CreateSpreadsheetData
    tx?: DatabaseClient
  }): Promise<SpreadsheetModel> {
    const { tx = db, workspaceId, id, spreadsheetId, data } = input
    await this.findByWorkspaceIdOrFail({ id, workspaceId })

    const [updated] = await tx
      .update(spreadsheetModel)
      .set({ ...data, spreadsheetId })
      .where(
        and(
          eq(spreadsheetModel.id, id),
          eq(spreadsheetModel.workspaceId, workspaceId),
        ),
      )
      .returning()
    return updated
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { tx = db, workspaceId, ids } = input
    if (ids.length === 0) {
      return
    }
    await tx
      .delete(spreadsheetModel)
      .where(
        and(
          eq(spreadsheetModel.workspaceId, workspaceId),
          inArray(spreadsheetModel.id, ids),
        ),
      )
  }

  async list(input: ListSpreadsheetsInput): Promise<ListSpreadsheetsResult> {
    const where = {
      workspaceId: input.workspaceId,
      name: input.name ? { ilike: likeContains(input.name) } : undefined,
    }

    const pagination = parsePagination(input)

    const [data, totalRows] = await Promise.all([
      db.query.spreadsheetModel.findMany({
        ...pagination,
        where,
      }),
      pagination?.limit
        ? db.$count(
            spreadsheetModel,
            relationsFilterToSQL(spreadsheetModel, where),
          )
        : Promise.resolve(1),
    ])

    const pageCount = pagination?.limit
      ? Math.ceil(totalRows / pagination.limit)
      : 1

    return { data, pageCount }
  }
}

export const spreadsheetService = new SpreadsheetService()
