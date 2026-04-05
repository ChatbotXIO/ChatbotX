"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { spreadsheetModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateSpreadsheetRequest,
  createSpreadsheetRequest,
} from "../schema/mutation"
import { verifyGoogleSheetsUrl } from "./util"

export const updateSpreadsheetAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(createSpreadsheetRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateSpreadsheet(
      {
        workspaceId,
        id,
      },
      parsedInput,
    )
  })

export const updateSpreadsheet = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: CreateSpreadsheetRequest,
) => {
  const spreadsheet = await findOrFail({
    table: spreadsheetModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Spreadsheet not found",
  })

  const spreadsheetId = await verifyGoogleSheetsUrl(
    ctx.workspaceId,
    parsedInput.url,
  )

  await db
    .update(spreadsheetModel)
    .set({
      ...parsedInput,
      spreadsheetId,
    })
    .where(eq(spreadsheetModel.id, spreadsheet.id))

  revalidateCacheTags(`workspaces:${spreadsheet.workspaceId}#spreadsheets`)
}
