import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { requireContactPermissionScope } from "../permissions"
import { getContact } from "../queries/get-contact.query"
import { getExportFile } from "../queries/get-export-file.query"
import {
  countContactInboxes,
  listAudienceInboxesPreview,
} from "../queries/list-contact-inboxes.queries"
import { countContacts, listContacts } from "../queries/list-contacts.queries"
import { getExportFileRequest, getExportFileResponse } from "../schema/action"
import {
  getContactRequest,
  getContactResponse,
  listContactInboxesAudiencePreviewRequest,
  listContactInboxesAudiencePreviewResponse,
  listContactsRequest,
  listContactsResponse,
} from "../schema/query"

export const contactsAuthenticatedAPI = {
  getContactAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/{contactId}",
      summary: "Get contact",
      tags: ["Contacts"],
    })
    .input(getContactRequest)
    .output(getContactResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, contactId } = input
      return await getContact({ workspaceId, contactId })
    }),

  listContactsByPOSTAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/contacts/list",
      summary: "List contacts using POST request",
      tags: ["Contacts"],
    })
    .input(listContactsRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listContactsResponse)
    .handler(async ({ input }) => {
      const { workspaceId, ...rest } = input
      return await listContacts({ ...rest, workspaceId })
    }),

  countContactsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/count",
      summary: "Count contacts",
      tags: ["Contacts"],
    })
    .input(listContactsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ total: z.number() }))
    .handler(async ({ input }) => await countContacts(input)),

  countContactInboxesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/inboxes/count",
      summary: "Count contact inboxes",
      tags: ["Contacts"],
    })
    .input(listContactsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ total: z.number() }))
    .handler(async ({ input }) => {
      const accessScope = await requireContactPermissionScope(input.workspaceId)
      return await countContactInboxes(input, accessScope)
    }),

  listContactInboxesAudiencePreviewAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/contacts/inboxes/audience-preview",
      summary: "List audience contact inboxes preview",
      tags: ["Contacts"],
    })
    .input(listContactInboxesAudiencePreviewRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listContactInboxesAudiencePreviewResponse)
    .handler(async ({ input }) => {
      const accessScope = await requireContactPermissionScope(input.workspaceId)
      return await listAudienceInboxesPreview(input, accessScope)
    }),

  getExportFileAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/export-files/{fileId}",
      summary: "Get contact export file status",
      tags: ["Contacts"],
    })
    .input(getExportFileRequest)
    .output(getExportFileResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      await requireContactPermissionScope(input.workspaceId)
      return await getExportFile(input)
    }),
}
