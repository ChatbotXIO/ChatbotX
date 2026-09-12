import { spreadsheetService } from "@chatbotx.io/business"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listWorksheetHeaders, listWorksheets } from "../lib/google-sheets"
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
    .handler(async ({ input }) => await spreadsheetService.list(input)),
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
    .handler(async ({ input }) => await listWorksheets(input)),
  listWorksheetHeadersAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/worksheets/{spreadsheetId}/headers",
      summary: "List worksheet headers",
      tags: ["Worksheet Headers"],
    })
    .input(listWorksheetHeadersRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listWorksheetHeadersResponse)
    .handler(async ({ input }) => await listWorksheetHeaders(input)),
}
