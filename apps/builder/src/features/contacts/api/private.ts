import { withChatbotIdSchema } from "@/features/chatbots/schemas/resource"
import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { setContactCustomFieldValue } from "../actions/add-contact-custom-field.action"
import { addContactTags } from "../actions/add-contact-tag.action"
import { createContact } from "../actions/create-contact.action"
import { deleteContactCustomFields } from "../actions/delete-contact-custom-field.action"
import { removeContactTags } from "../actions/remove-contact-tag.action"
import { listContactCustomFields } from "../queries/list-contact-fields.query"
import { listContactTags } from "../queries/list-contact-tags.query"
import { listContacts } from "../queries/list-contacts.queries"
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

export const privateAPIs = {
  privateListContactsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/contacts",
      summary: "List contacts",
      tags: ["Contacts"],
    })
    .input(listContactsRequest.and(withChatbotIdSchema))
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listContactsResponse)
    .handler(async ({ input }) => {
      const { chatbotId, ...rest } = input
      return await listContacts({ ...rest, chatbotId })
    }),

  privateCreateContactAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/chatbots/{chatbotId}/contacts",
      summary: "Create a contact",
      tags: ["Contacts"],
    })
    .input(createContactRequest.and(withChatbotIdSchema))
    .output(createContactResponse)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      const { chatbotId, ...parsedInput } = input
      return await createContact({ chatbotId, parsedInput })
    }),

  privateListContactTagsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/contacts/{contactId}/tags",
      summary: "List contact tags",
      tags: ["Contacts"],
    })
    .input(listContactTagsRequest)
    .output(listContactTagsResponse)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      const { chatbotId, contactId } = input
      return await listContactTags({
        chatbotId,
        contactId,
      })
    }),

  privateAddContactTagAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/chatbots/{chatbotId}/contacts/tags",
      summary: "Add tags to contact",
      tags: ["Contacts"],
    })
    .input(addContactTagRequest.and(withChatbotIdSchema))
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      const { chatbotId, tags, ids } = input
      await addContactTags({
        chatbotId,
        parsedInput: {
          ids,
          tags,
        },
      })
    }),

  privateRemoveContactTagAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/chatbots/{chatbotId}/contacts/{contactId}/tags/{tagId}",
      summary: "Remove tag from contact",
      tags: ["Contacts"],
    })
    .input(removeContactTagRequest.and(withChatbotIdSchema))
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      const { chatbotId, contactId, tagId } = input
      await removeContactTags({
        chatbotId,
        parsedInput: {
          ids: [contactId],
          tags: [tagId],
        },
      })
    }),

  privateListContactFieldsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/contacts/{contactId}/fields",
      summary: "List contact custom fields",
      tags: ["Contacts"],
    })
    .input(listContactCustomFieldsRequest)
    .output(listPublicContactCustomFieldsResponse)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      const { chatbotId, contactId } = input

      return await listContactCustomFields({
        chatbotId,
        contactId,
      })
    }),

  privateAddContactFieldAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/chatbots/{chatbotId}/contacts/{contactId}/fields",
      summary: "Set contact custom field value",
      tags: ["Contacts"],
    })
    .input(setContactCustomFieldValueRequest.and(withChatbotIdSchema))
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      const { chatbotId, contactId } = input
      return await setContactCustomFieldValue({
        chatbotId,
        contactId,
        customFieldId: input.customFieldId,
        value: input.value,
      })
    }),

  privateDeleteContactFieldAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/chatbots/{chatbotId}/contacts/{contactId}/fields/{customFieldId}",
      summary: "Delete contact custom field",
      tags: ["Contacts"],
    })
    .input(deleteContactCustomFieldRequest.and(withChatbotIdSchema))
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      const { chatbotId, contactId, customFieldId } = input
      return await deleteContactCustomFields({
        chatbotId,
        contactIds: [contactId],
        customFieldId,
      })
    }),
}

export default privateAPIs
