import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { setContactCustomFieldValue } from "../actions/add-contact-custom-field.action"
import { addContactTags } from "../actions/add-contact-tag.action"
import { createContact } from "../actions/create-contact.action"
import { deleteContactCustomFields } from "../actions/delete-contact-custom-field.action"
import { removeContactTags } from "../actions/remove-contact-tag.action"
import { listContactCustomFields } from "../queries/list-contact-fields.query"
import { listContactTags } from "../queries/list-contact-tags.query"
import { countContacts, listContacts } from "../queries/list-contacts.queries"
import { createContactRequest, createContactResponse } from "../schemas/action"
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
import { listContactsRequest, listContactsResponse } from "../schemas/query"

export const contactsAuthenticatedAPI = {
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
    .handler(async ({ input }) => {
      return await countContacts(input)
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
      return await createContact({ workspaceId, parsedInput })
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
      return await listContactTags({
        workspaceId,
        contactId,
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
      await addContactTags({
        workspaceId,
        parsedInput: {
          ids,
          tags,
        },
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
      await removeContactTags({
        workspaceId,
        parsedInput: {
          ids: [contactId],
          tags: [tagId],
        },
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

      return await listContactCustomFields({
        workspaceId,
        contactId,
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
      return await setContactCustomFieldValue({
        workspaceId,
        contactId,
        customFieldId: input.customFieldId,
        value: input.value,
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
      return await deleteContactCustomFields({
        workspaceId,
        contactIds: [contactId],
        customFieldId,
      })
    }),
}

export default contactsAuthenticatedAPI
