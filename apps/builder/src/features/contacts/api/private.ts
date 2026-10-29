import { contactExportService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listContactAdReferrals } from "../lib/list-contact-ad-referrals"
import { listContactExportFiles } from "../lib/list-contact-export-files"
import {
  buildContactPermissionScope,
  exportFileOwnerFilter,
  requireContactPermissionScope,
  requireContactPermissionScopeForMember,
} from "../permissions"
import { getContact } from "../queries/get-contact.query"
import {
  countContactInboxes,
  listAudienceInboxesPreview,
} from "../queries/list-contact-inboxes.queries"
import { countContacts, listContacts } from "../queries/list-contacts.queries"
import { getExportFileRequest, getExportFileResponse } from "../schema/action"
import {
  listContactAdReferralsRequest,
  listContactAdReferralsResponse,
} from "../schema/ad-referral"
import {
  listContactExportFilesRequest,
  listContactExportFilesResponse,
} from "../schema/export-file"
import {
  countContactsRequest,
  countContactsResponse,
  getContactRequest,
  getContactResponse,
  listContactInboxesAudiencePreviewRequest,
  listContactInboxesAudiencePreviewResponse,
  listContactsRequest,
  listContactsTableResponse,
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
    .handler(async ({ input, context }) => {
      const { workspaceId, contactId } = input
      const scope = buildContactPermissionScope({
        permissions: context.workspaceMember.permissions,
        userId: context.user.id,
      })
      if (!scope) {
        throw notFoundException("Contact not found")
      }

      return await getContact({ workspaceId, contactId }, scope)
    }),

  listContactAdReferralsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/ad-referrals",
      summary: "List the ads a contact came from",
      tags: ["Contacts"],
    })
    .input(listContactAdReferralsRequest.and(getContactRequest))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listContactAdReferralsResponse)
    .handler(async ({ input, context }) => {
      const scope = requireContactPermissionScopeForMember({
        permissions: context.workspaceMember.permissions,
        userId: context.user.id,
      })
      return await listContactAdReferrals({
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        perPage: input.perPage,
        cursor: input.cursor,
        accessScope: {
          restrictToAssignedUserId: scope.restrictToAssignedUserId,
        },
      })
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
    .output(listContactsTableResponse)
    .handler(async ({ input, context }) => {
      const scope = requireContactPermissionScopeForMember({
        permissions: context.workspaceMember.permissions,
        userId: context.user.id,
      })
      return await listContacts(input, scope)
    }),

  countContactsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/count",
      summary: "Count contacts",
      tags: ["Contacts"],
    })
    .input(countContactsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(countContactsResponse)
    .handler(async ({ input, context }) => {
      const scope = requireContactPermissionScopeForMember({
        permissions: context.workspaceMember.permissions,
        userId: context.user.id,
      })
      return await countContacts(input, scope)
    }),

  countContactInboxesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/inboxes/count",
      summary: "Count contact inboxes",
      tags: ["Contacts"],
    })
    .input(countContactsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(countContactsResponse)
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
    .handler(async ({ input, context }) => {
      await requireContactPermissionScope(input.workspaceId)
      return await contactExportService.getFile({
        ...input,
        userId: exportFileOwnerFilter(context),
      })
    }),

  listExportFilesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/export-files",
      summary: "List contact exports",
      tags: ["Contacts"],
    })
    .input(listContactExportFilesRequest.and(withWorkspaceIdSchema))
    .output(listContactExportFilesResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input, context }) => {
      await requireContactPermissionScope(input.workspaceId)
      return await listContactExportFiles({
        workspaceId: input.workspaceId,
        userId: exportFileOwnerFilter(context),
        perPage: input.perPage,
        cursor: input.cursor,
      })
    }),
}
