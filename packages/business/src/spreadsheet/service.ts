import {
  type DatabaseClient,
  db,
  findOrFail,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { spreadsheetModel } from "@chatbotx.io/database/schema"
import type { SpreadsheetModel } from "@chatbotx.io/database/types"
import { parsePagination } from "@chatbotx.io/database/utils"
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
  }): Promise<void> {
    const { tx = db, workspaceId, spreadsheetId, data } = input
    await tx.insert(spreadsheetModel).values({
      ...data,
      id: createId(),
      workspaceId,
      spreadsheetId,
    })
  }

  async list(input: ListSpreadsheetsInput): Promise<ListSpreadsheetsResult> {
    const where = {
      workspaceId: input.workspaceId,
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
