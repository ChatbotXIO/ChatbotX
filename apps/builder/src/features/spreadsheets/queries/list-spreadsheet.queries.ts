import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { spreadsheetModel } from "@chatbotx.io/database/schema"
import { parsePagination } from "@chatbotx.io/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import type { ListSpreadsheetsRequest } from "../schema/query"
import type { SpreadsheetResource } from "../schema/resource"

export const listSpreadsheets = async (
  input: ListSpreadsheetsRequest,
): Promise<PaginatedResponse<SpreadsheetResource>> => {
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
