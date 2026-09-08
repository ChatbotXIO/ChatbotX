import { contactExportService } from "@chatbotx.io/business"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  exportContactsRequest,
  exportContactsResponse,
} from "../../schema/action"
import {
  getExportFilePublicRequest,
  getExportFilePublicResponse,
} from "../../schema/public/export"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsExportPublicRouter = {
  export: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/export",
      summary: "Start a contact export job",
      description:
        'Enqueues a CSV export of contacts and returns immediately with a `fileId` — poll `GET /v1/contacts/export-files/{fileId}` for status and the download URL once it finishes. Either `contactIds` or `exportAll: true` with an optional `filter` is required. Example: `{"fields":["sys:firstName","sys:email"],"exportAll":true,"filter":{"contactFilter":{...}}}`.',
      successStatus: 202,
      tags: ["Contacts"],
    })
    .input(exportContactsRequest)
    .output(exportContactsResponse)
    .handler(
      async ({ context, input }) =>
        await contactExportService.start({
          workspaceId: context.workspace.id,
          // A workspace token has no session user, and (per the PII note in
          // docs/developer/workspace-api-tokens.md) is never member-scoped —
          // it always sees full PII, unlike a session caller whose export
          // may be restricted by `canViewEmailAndPhone`/`restrictToAssignedUserId`.
          requestedUserId: null,
          canExportEmailAndPhone: true,
          ...input,
        }),
    ),
  getExportFile: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/export-files/{fileId}",
      summary: "Get a contact export file's status and download URL",
      tags: ["Contacts"],
    })
    .input(getExportFilePublicRequest)
    .output(getExportFilePublicResponse)
    .handler(
      async ({ context, input }) =>
        await contactExportService.getFile({
          workspaceId: context.workspace.id,
          fileId: input.fileId,
        }),
    ),
}
