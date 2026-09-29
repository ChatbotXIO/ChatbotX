import { spreadsheetService } from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listWorksheetHeaders, listWorksheets } from "../lib/google-sheets"
import { createSpreadsheet, updateSpreadsheet } from "../lib/manage-spreadsheet"
import {
  createSpreadsheetPublicRequest,
  createSpreadsheetPublicResponse,
  deleteSpreadsheetPublicRequest,
  getSpreadsheetPublicRequest,
  listSpreadsheetsPublicRequest,
  listSpreadsheetsPublicResponse,
  listWorksheetHeadersPublicRequest,
  listWorksheetHeadersResponse,
  listWorksheetsPublicRequest,
  listWorksheetsResponse,
  spreadsheetPublicResource,
  updateSpreadsheetPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

const manageMessages = {
  integrationMissing: "You need to setup google sheets first.",
  invalidUrl: "URL must be a valid, public or shareable Google Sheets link.",
}

export const spreadsheetsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/spreadsheets",
      summary: "List spreadsheets",
      description:
        "Use this to find spreadsheet ids before inspecting one with `spreadsheets.get` or listing its worksheets with `spreadsheets.listWorksheets`. Returns spreadsheets in this workspace.",
      tags: ["Spreadsheets"],
    })
    .input(listSpreadsheetsPublicRequest)
    .output(listSpreadsheetsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await spreadsheetService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/spreadsheets/{id}",
      summary: "Get spreadsheet",
      description:
        "Returns one connected spreadsheet's settings. Use `spreadsheets.list` to find its id first.",
      tags: ["Spreadsheets"],
    })
    .input(getSpreadsheetPublicRequest)
    .output(spreadsheetPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await spreadsheetService.findByWorkspaceIdOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/spreadsheets",
      summary: "Create spreadsheet",
      description:
        "Connects a Google Sheets spreadsheet by its shareable URL. Requires the workspace's Google Sheets integration to be set up first.",
      successStatus: 201,
      tags: ["Spreadsheets"],
    })
    .input(createSpreadsheetPublicRequest)
    .output(createSpreadsheetPublicResponse)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await createSpreadsheet({
          workspaceId: context.workspace.id,
          data: input,
          messages: manageMessages,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/spreadsheets/{id}",
      summary: "Update spreadsheet",
      description:
        "Changes an existing spreadsheet connection's settings. Call `spreadsheets.get` to inspect current values first.",
      tags: ["Spreadsheets"],
    })
    .input(updateSpreadsheetPublicRequest)
    .output(spreadsheetPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await updateSpreadsheet({
        workspaceId: context.workspace.id,
        id,
        data,
        messages: manageMessages,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/spreadsheets/{id}",
      summary: "Delete spreadsheet",
      description:
        "Disconnects a spreadsheet. Use `spreadsheets.list` to find its id first.",
      successStatus: 204,
      tags: ["Spreadsheets"],
    })
    .input(deleteSpreadsheetPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await spreadsheetService.deleteMany({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),

  listWorksheets: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/spreadsheets/{id}/worksheets",
      summary: "List worksheets",
      description:
        "Returns the sheet tabs (worksheets) inside a connected spreadsheet. Use `spreadsheets.list` to find the spreadsheet id first.",
      tags: ["Spreadsheets"],
    })
    .input(listWorksheetsPublicRequest)
    .output(listWorksheetsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await listWorksheets({
          spreadsheetId: input.id,
          workspaceId: context.workspace.id,
        }),
    ),

  listWorksheetHeaders: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/spreadsheets/{id}/worksheets/{worksheetName}/headers",
      summary: "List worksheet headers",
      description:
        "Returns the column headers of a worksheet's first row. Use `spreadsheets.listWorksheets` to find the worksheet name first.",
      tags: ["Spreadsheets"],
    })
    .input(listWorksheetHeadersPublicRequest)
    .output(listWorksheetHeadersResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await listWorksheetHeaders({
          workspaceId: context.workspace.id,
          spreadsheetId: input.id,
          sheetName: input.worksheetName,
        }),
    ),
}
