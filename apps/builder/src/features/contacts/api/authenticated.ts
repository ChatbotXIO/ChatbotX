import { db } from "@chatbotx.io/database/client"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { setContactCustomFieldValue } from "../actions/add-contact-custom-field.action"
import { addContactTags } from "../actions/add-contact-tag.action"
import { createContact } from "../actions/create-contact.action"
import { deleteContactCustomFields } from "../actions/delete-contact-custom-field.action"
import { removeContactTags } from "../actions/remove-contact-tag.action"
import { requireContactPermissionScope } from "../permissions"
import { getContact } from "../queries/get-contact.query"
import { getExportFile } from "../queries/get-export-file.query"
import { listContactCustomFields } from "../queries/list-contact-fields.query"
import { countContactInboxes } from "../queries/list-contact-inboxes.queries"
import { listContactTags } from "../queries/list-contact-tags.query"
import { countContacts, listContacts } from "../queries/list-contacts.queries"
import {
  createContactRequest,
  createContactResponse,
  getExportFileRequest,
  getExportFileResponse,
} from "../schemas/action"
import {
  deleteContactCustomFieldRequest,
  listContactCustomFieldsRequest,
  listPublicContactCustomFieldsResponse,
  setContactCustomFieldValueRequest,
} from "../schemas/contact-custom-field"
import {
  addContactTagRequest,
  listContactTagsRequest,
  listContactTagsResponse,
  removeContactTagRequest,
} from "../schemas/contact-tag"
import {
  getContactRequest,
  getContactResponse,
  listContactsRequest,
  listContactsResponse,
} from "../schemas/query"

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

  listContactsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts",
      summary: "List contacts",
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
      await requireContactPermissionScope(input.workspaceId)
      return await countContactInboxes(input)
    }),

  createContactAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/contacts",
      summary: "Create a contact",
      tags: ["Contacts"],
    })
    .input(createContactRequest.and(withWorkspaceIdSchema))
    .output(createContactResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, ...parsedInput } = input
      await requireContactPermissionScope(workspaceId)
      return await createContact({ workspaceId, parsedInput })
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

  listContactTagsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/tags",
      summary: "List contact tags",
      tags: ["Contacts"],
    })
    .input(listContactTagsRequest)
    .output(listContactTagsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, contactId } = input
      const accessScope = await requireContactPermissionScope(workspaceId)
      return await listContactTags({
        workspaceId,
        contactId,
        accessScope,
      })
    }),

  addContactTagAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/contacts/tags",
      summary: "Add tags to contact",
      tags: ["Contacts"],
    })
    .input(addContactTagRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, tags, ids } = input
      const accessScope = await requireContactPermissionScope(workspaceId)
      await addContactTags({
        workspaceId,
        parsedInput: {
          ids,
          tags,
        },
        accessScope,
      })
    }),

  removeContactTagAuthenticatedAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/tags/{tagId}",
      summary: "Remove tag from contact",
      tags: ["Contacts"],
    })
    .input(removeContactTagRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, contactId, tagId } = input
      const accessScope = await requireContactPermissionScope(workspaceId)
      // removeContactTags resolves tags by name; this endpoint takes a tag id.
      const tag = await db.query.tagModel.findFirst({
        where: { workspaceId, id: tagId, deletedAt: { isNull: true as const } },
        columns: { name: true },
      })
      if (!tag) {
        return
      }
      await removeContactTags({
        workspaceId,
        parsedInput: {
          ids: [contactId],
          tags: [tag.name],
        },
        accessScope,
      })
    }),

  listContactFieldsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/fields",
      summary: "List contact custom fields",
      tags: ["Contacts"],
    })
    .input(listContactCustomFieldsRequest)
    .output(listPublicContactCustomFieldsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, contactId } = input
      const accessScope = await requireContactPermissionScope(workspaceId)

      return await listContactCustomFields({
        workspaceId,
        contactId,
        accessScope,
      })
    }),

  addContactFieldAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/fields",
      summary: "Set contact custom field value",
      tags: ["Contacts"],
    })
    .input(setContactCustomFieldValueRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, contactId } = input
      const accessScope = await requireContactPermissionScope(workspaceId)
      return await setContactCustomFieldValue({
        workspaceId,
        contactId,
        customFieldId: input.customFieldId,
        value: input.value,
        accessScope,
      })
    }),

  deleteContactFieldAuthenticatedAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/fields/{customFieldId}",
      summary: "Delete contact custom field",
      tags: ["Contacts"],
    })
    .input(deleteContactCustomFieldRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, contactId, customFieldId } = input
      const accessScope = await requireContactPermissionScope(workspaceId)
      return await deleteContactCustomFields({
        workspaceId,
        contactIds: [contactId],
        customFieldId,
        accessScope,
      })
    }),
}
