import { z } from "zod"
import {
  sendFileMessage,
  sendFlowMessage,
  sendTextMessage,
} from "@/features/messages/actions/create-message.action"
import {
  sendFileMessageRequest,
  sendFlowMessageRequest,
  sendTextMessageRequest,
} from "@/features/messages/schemas/create-message.schema"
import { chatbotTokenAPI } from "@/orpc"
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
  listContactCustomFieldsResponse,
  setContactCustomFieldValueRequest,
} from "../schemas/contact-custom-field"
import {
  addContactTagRequest,
  listContactTagsResponse,
  removeContactTagRequest,
} from "../schemas/contact-tag"
import { listContactsRequest, listContactsResponse } from "../schemas/query"

export const publicAPIs = {
  publicListContactsAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/chatbots/contacts",
      summary: "List contacts",
      tags: ["Contacts"],
    })
    .input(listContactsRequest)
    .output(listContactsResponse)
    .handler(async ({ context, input }) => {
      return await listContacts({
        ...input,
        chatbotId: context.chatbot.id,
      })
    }),
  publicCreateContactAPI: chatbotTokenAPI
    .route({
      method: "POST",
      path: "/public/chatbots/contacts",
      summary: "Create a contact",
      tags: ["Contacts"],
    })
    .input(createContactRequest)
    .output(createContactResponse)
    .handler(async ({ context, input }) => {
      return await createContact({
        chatbotId: context.chatbot.id,
        parsedInput: input,
      })
    }),
  publicListContactTagsAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/chatbots/contacts/{contactId}/tags",
      summary: "List contact tags",
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: z.string() }))
    .output(listContactTagsResponse)
    .handler(async ({ context, input }) => {
      const { contactId } = input
      return await listContactTags({
        chatbotId: context.chatbot.id,
        contactId,
      })
    }),
  publicAddContactTagsAPI: chatbotTokenAPI
    .route({
      method: "POST",
      path: "/public/chatbots/contacts/tags",
      summary: "Add contact tags",
      tags: ["Contacts"],
    })
    .input(addContactTagRequest)
    .handler(async ({ context, input }) => {
      const { tags, ids } = input
      await addContactTags({
        chatbotId: context.chatbot.id,
        parsedInput: {
          ids,
          tags,
        },
      })
    }),
  publicDeleteContactTagAPI: chatbotTokenAPI
    .route({
      method: "DELETE",
      path: "/public/chatbots/contacts/{contactId}/tags/{tagId}",
      summary: "Remove contact tags",
      tags: ["Contacts"],
    })
    .input(removeContactTagRequest)
    .handler(async ({ context, input }) => {
      const { contactId, tagId } = input
      await removeContactTags({
        chatbotId: context.chatbot.id,
        parsedInput: {
          ids: [contactId],
          tags: [tagId],
        },
      })
    }),
  publicListContactCustomFieldsAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/chatbots/contacts/{contactId}/custom-fields",
      summary: "List contact custom fields",
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: z.string() }))
    .output(listContactCustomFieldsResponse)
    .handler(async ({ context, input }) => {
      const { contactId } = input
      return await listContactCustomFields({
        chatbotId: context.chatbot.id,
        contactId,
      })
    }),
  publicSetContactCustomFieldValueAPI: chatbotTokenAPI
    .route({
      method: "POST",
      path: "/public/chatbots/contacts/{contactId}/custom-fields",
      summary: "Set contact custom field value",
      tags: ["Contacts"],
    })
    .input(setContactCustomFieldValueRequest)
    .handler(async ({ context, input }) => {
      const { contactId } = input
      const chatbotId = context.chatbot.id
      await setContactCustomFieldValue({
        chatbotId,
        contactId,
        customFieldId: input.customFieldId,
        value: input.value,
      })
    }),
  publicDeleteContactCustomFieldAPI: chatbotTokenAPI
    .route({
      method: "DELETE",
      path: "/public/chatbots/contacts/{contactId}/custom-fields/{customFieldId}",
      summary: "Delete contact custom field",
      tags: ["Contacts"],
    })
    .input(deleteContactCustomFieldRequest)
    .handler(async ({ context, input }) => {
      const chatbotId = context.chatbot.id
      const { contactId, customFieldId } = input
      await deleteContactCustomFields({
        chatbotId,
        contactIds: [contactId],
        fieldId: customFieldId,
      })
    }),
  publicSendTextMessageAPI: chatbotTokenAPI
    .route({
      method: "POST",
      path: "/public/chatbots/contacts/{contactId}/send/text",
      summary: "Send text message to contact",
      tags: ["Contacts"],
    })
    .input(sendTextMessageRequest)
    .handler(async ({ context, input }) => {
      const { contactId, text, channel } = input
      const chatbotId = context.chatbot.id
      await sendTextMessage({
        chatbotId,
        contactId,
        channel,
        text,
      })
    }),
  publicSendFileMessageAPI: chatbotTokenAPI
    .route({
      method: "POST",
      path: "/public/chatbots/contacts/{contactId}/send/file",
      summary: "Send file message to contact",
      tags: ["Contacts"],
    })
    .input(sendFileMessageRequest)
    .handler(async ({ context, input }) => {
      const chatbotId = context.chatbot.id
      const { contactId, file, channel } = input
      await sendFileMessage({
        chatbotId,
        contactId,
        file,
        channel,
      })
    }),
  publicSendFlowMessageAPI: chatbotTokenAPI
    .route({
      method: "POST",
      path: "/public/chatbots/contacts/{contactId}/send/flow",
      summary: "Send flow message to contact",
      tags: ["Contacts"],
    })
    .input(sendFlowMessageRequest)
    .handler(async ({ context, input }) => {
      const chatbotId = context.chatbot.id
      const { contactId, flowId, channel } = input
      await sendFlowMessage({
        chatbotId,
        contactId,
        flowId,
        channel,
      })
    }),
}

export default publicAPIs
