import { spreadsheetService } from "@chatbotx.io/business"
import type { SpreadsheetModel } from "@chatbotx.io/database/types"
import type { CreateSpreadsheetRequest } from "../schema/mutation"
import { resolveSpreadsheetIdFromUrl } from "./google-sheets"

type ManageSpreadsheetMessages = {
  integrationMissing: string
  invalidUrl: string
}

export async function createSpreadsheet(input: {
  workspaceId: string
  data: CreateSpreadsheetRequest
  messages: ManageSpreadsheetMessages
}): Promise<{ id: string }> {
  const spreadsheetId = await resolveSpreadsheetIdFromUrl({
    workspaceId: input.workspaceId,
    url: input.data.url,
    messages: input.messages,
  })

  return await spreadsheetService.create({
    workspaceId: input.workspaceId,
    spreadsheetId,
    data: input.data,
  })
}

export async function updateSpreadsheet(input: {
  workspaceId: string
  id: string
  data: CreateSpreadsheetRequest
  messages: ManageSpreadsheetMessages
}): Promise<SpreadsheetModel> {
  const spreadsheetId = await resolveSpreadsheetIdFromUrl({
    workspaceId: input.workspaceId,
    url: input.data.url,
    messages: input.messages,
  })

  return await spreadsheetService.update({
    workspaceId: input.workspaceId,
    id: input.id,
    spreadsheetId,
    data: input.data,
  })
}
