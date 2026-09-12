import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListResponse, withPublicPaging } from "@/lib/public-api/list"
import { createSpreadsheetRequest } from "./mutation"
import { listSpreadsheetsRequest } from "./query"
import { spreadsheetResource } from "./resource"

export const spreadsheetPublicResource = spreadsheetResource.omit({
  workspaceId: true,
})

export const listSpreadsheetsPublicRequest = withPublicPaging(
  listSpreadsheetsRequest.omit({ workspaceId: true }),
)

export const listSpreadsheetsPublicResponse = publicListResponse(
  spreadsheetPublicResource,
)

export const getSpreadsheetPublicRequest = z.object({
  id: zodBigintAsString(),
})

export const createSpreadsheetPublicRequest = createSpreadsheetRequest
export const createSpreadsheetPublicResponse = z.object({
  id: zodBigintAsString(),
})

export const updateSpreadsheetPublicRequest = createSpreadsheetRequest.extend({
  id: zodBigintAsString(),
})

export const deleteSpreadsheetPublicRequest = z.object({
  id: zodBigintAsString(),
})

export const listWorksheetsPublicRequest = z.object({
  spreadsheetId: zodBigintAsString(),
})
export { listWorksheetsResponse } from "./query"

export const listWorksheetHeadersPublicRequest = z.object({
  spreadsheetId: zodBigintAsString(),
  worksheetName: z.string(),
})
export { listWorksheetHeadersResponse } from "./query"
