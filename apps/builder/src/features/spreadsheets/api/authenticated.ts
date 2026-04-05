import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listSpreadsheets } from "../queries/list-spreadsheet.queries"
import {
  listWorksheetHeaders,
  listWorksheets,
} from "../queries/list-worksheet.queries"
import {
  listSpreadsheetsRequest,
  listSpreadsheetsResponse,
  listWorksheetHeadersRequest,
  listWorksheetHeadersResponse,
  listWorksheetsRequest,
  listWorksheetsResponse,
} from "../schema/query"

export const spreadsheetsAuthenticatedAPI = {
  listSpreadsheetsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/spreadsheets",
      summary: "List spreadsheets",
      tags: ["Spreadsheets"],
    })
    .input(listSpreadsheetsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listSpreadsheetsResponse)
    .handler(async ({ input }) => {
      return await listSpreadsheets(input)
    }),
  listWorksheetsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/worksheets",
      summary: "List worksheets",
      tags: ["Worksheets"],
    })
    .input(listWorksheetsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listWorksheetsResponse)
    .handler(async ({ input }) => {
      return await listWorksheets(input)
    }),
  listWorksheetHeadersAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/worksheets/{id}/headers",
      summary: "List worksheet headers",
      tags: ["Worksheet Headers"],
    })
    .input(listWorksheetHeadersRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listWorksheetHeadersResponse)
    .handler(async ({ input }) => {
      return await listWorksheetHeaders(input)
    }),
}
