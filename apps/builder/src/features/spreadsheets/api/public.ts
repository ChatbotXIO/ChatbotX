import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listSpreadsheets } from "../queries/list-spreadsheet.queries"
import {
  listWorksheetHeaders,
  listWorksheets,
} from "../queries/list-worksheet.queries"
import {
  listSpreadsheetsPublicRequest,
  listSpreadsheetsPublicResponse,
  listWorksheetHeadersPublicRequest,
  listWorksheetHeadersResponse,
  listWorksheetsPublicRequest,
  listWorksheetsResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const spreadsheetsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/spreadsheets",
      summary: "List spreadsheets",
      tags: ["Spreadsheets"],
    })
    .input(listSpreadsheetsPublicRequest)
    .output(listSpreadsheetsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listSpreadsheets({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  listWorksheets: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/spreadsheets/{spreadsheetId}/worksheets",
      summary: "List worksheets",
      tags: ["Spreadsheets"],
    })
    .input(listWorksheetsPublicRequest)
    .output(listWorksheetsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await listWorksheets({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  listWorksheetHeaders: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/spreadsheets/{spreadsheetId}/worksheets/{worksheetId}/headers",
      summary: "List worksheet headers",
      tags: ["Spreadsheets"],
    })
    .input(listWorksheetHeadersPublicRequest)
    .output(listWorksheetHeadersResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await listWorksheetHeaders({
          workspaceId: context.workspace.id,
          spreadsheetId: input.spreadsheetId,
          sheetName: input.worksheetId,
        }),
    ),
}
