import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listSpreadsheets } from "../queries/list-spreadsheet.queries"
import {
  listWorksheetHeaders,
  listWorksheets,
} from "../queries/list-worksheet.qureies"
import {
  listSpreadsheetsRequest,
  listSpreadsheetsResponse,
  listWorksheetHeadersRequest,
  listWorksheetHeadersResponse,
  listWorksheetsRequest,
  listWorksheetsResponse,
} from "../schemas/query"

export const spreadsheetsAuthenticatedAPI = {
  listSpreadsheetsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/spreadsheets",
      summary: "List spreadsheets",
      tags: ["Spreadsheets"],
    })
    .input(listSpreadsheetsRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listSpreadsheetsResponse)
    .handler(async ({ input }) => {
      return await listSpreadsheets(input)
    }),
  listWorksheetsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/worksheets",
      summary: "List worksheets",
      tags: ["Worksheets"],
    })
    .input(listWorksheetsRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listWorksheetsResponse)
    .handler(async ({ input }) => {
      return await listWorksheets(input)
    }),
  listWorksheetHeadersAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/worksheets/{id}/headers",
      summary: "List worksheet headers",
      tags: ["Worksheet Headers"],
    })
    .input(listWorksheetHeadersRequest)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listWorksheetHeadersResponse)
    .handler(async ({ input }) => {
      return await listWorksheetHeaders(input)
    }),
}
