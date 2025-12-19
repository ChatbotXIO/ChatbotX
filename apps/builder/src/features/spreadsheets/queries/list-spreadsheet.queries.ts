import { type Prisma, prisma } from "@aha.chat/database"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { getPaginationFromInput } from "@/lib/pagination"
import type { ListSpreadsheetsRequest } from "../schemas/list-spreadsheets.request"
import type { SpreadsheetResource } from "../schemas/resource"

export const listSpreadsheets = async (
  input: ListSpreadsheetsRequest,
): Promise<PaginatedResponse<SpreadsheetResource>> => {
  let pageCount = 1
  const pagination = getPaginationFromInput(input)

  const where: Prisma.SpreadsheetWhereInput = {
    chatbotId: input.chatbotId,
  }

  return await prisma.$transaction(async (tx) => {
    const data = await tx.spreadsheet.findMany({
      ...pagination,
      where,
    })

    if (pagination.skip && pagination.take) {
      const total = await tx.spreadsheet.count({ where })
      pageCount = Math.ceil(total / pagination.take)
    }

    return { data, pageCount }
  })
}
