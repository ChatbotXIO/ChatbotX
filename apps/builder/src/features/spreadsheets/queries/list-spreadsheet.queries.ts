import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { spreadsheetModel } from "@aha.chat/database/schema"
import { parsePagination } from "@aha.chat/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import type { ListSpreadsheetsRequest } from "../schemas/list-spreadsheets.request"
import type { SpreadsheetResource } from "../schemas/resource"

export const listSpreadsheets = async (
  input: ListSpreadsheetsRequest,
): Promise<PaginatedResponse<SpreadsheetResource>> => {
  const where = {
    chatbotId: input.chatbotId,
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
