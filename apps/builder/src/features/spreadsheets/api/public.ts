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
      summary: "Get a spreadsheet",
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
      summary: "Create a spreadsheet",
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
      summary: "Update a spreadsheet",
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
      summary: "Delete a spreadsheet",
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
      path: "/v1/spreadsheets/{spreadsheetId}/worksheets/{worksheetName}/headers",
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
          sheetName: input.worksheetName,
        }),
    ),
}
