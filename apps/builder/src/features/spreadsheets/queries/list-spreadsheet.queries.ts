import { type Prisma, prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import type { PaginationResponse } from "@/features/common/schemas/pagination"
import { calcCacheTags } from "@/lib/cache-helper"
import { getPaginationFromInput } from "@/lib/pagination"
import type { ListSpreadsheetsRequest } from "../schemas/list-spreadsheets.request"
import type { SpreadsheetResource } from "../schemas/resource"

export const listSpreadsheets = async (
  input: ListSpreadsheetsRequest,
): Promise<PaginationResponse<SpreadsheetResource>> => {
  let pageCount = 1
  const pagination = getPaginationFromInput(input)

  return await unstable_cache(
    async () => {
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
    },
    [JSON.stringify(input)],
    calcCacheTags([`chatbots:${input.chatbotId}#spreadsheets`]),
  )()
}
