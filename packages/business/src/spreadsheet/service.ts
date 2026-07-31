import { findOrFail } from "@chatbotx.io/database/client"
import { spreadsheetModel } from "@chatbotx.io/database/schema"
import type { SpreadsheetModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"

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
}

export const spreadsheetService = new SpreadsheetService()
