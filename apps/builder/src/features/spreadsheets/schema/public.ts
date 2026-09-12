import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListResponse, withPublicPaging } from "@/lib/public-api/list"
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
export const listWorksheetsPublicRequest = z.object({
  spreadsheetId: zodBigintAsString(),
})
export { listWorksheetsResponse } from "./query"

export const listWorksheetHeadersPublicRequest = z.object({
  spreadsheetId: zodBigintAsString(),
  worksheetId: z.string(),
})
export { listWorksheetHeadersResponse } from "./query"
