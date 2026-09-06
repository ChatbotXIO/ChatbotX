import { spreadsheetService } from "@chatbotx.io/business"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import type { ListSpreadsheetsRequest } from "../schema/query"
import type { SpreadsheetResource } from "../schema/resource"

export const listSpreadsheets = async (
  input: ListSpreadsheetsRequest,
): Promise<PaginatedResponse<SpreadsheetResource>> =>
  await spreadsheetService.list(input)
