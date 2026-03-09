import { z } from "zod"
import { publicLstTagsResponse } from "@/features/tags/schemas/query"
import { NotfoundException } from "@/lib/errors/exception"
import { chatbotTokenAPI } from "@/orpc"
import { setContactCustomFieldValue } from "../actions/add-contact-custom-field.action"
import {
  attachContactTag,
  detachContactTag,
} from "../actions/add-contact-tag.action"
import { createContact } from "../actions/create-contact.action"
import { deleteContactCustomFields } from "../actions/delete-contact-custom-field.action"
import {
  findContactCustomField,
  listContactCustomFields,
} from "../queries/list-contact-fields.query"
import { listContactTags } from "../queries/list-contact-tags.query"
import {
  publicFindContact,
  publicListContactsByCustomField,
} from "../queries/public-find-contact"
import { createContactRequest } from "../schemas/action"
import {
  deleteContactCustomFieldRequest,
  listPublicContactCustomFieldsResponse,
  publicContactCustomFieldResource,
  setContactCustomFieldValueRequest,
} from "../schemas/contact-custom-field"
import { removeContactTagRequest } from "../schemas/contact-tag"
import {
  publicFindContactResponse,
  publicListContactsByCustomFieldRequest,
  publicListContactsResponse,
} from "../schemas/query"

export const publicAPIs = {
  publicFindContactAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/contacts/{contactId}",
      summary: "Get contact by contact id",
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: z.string() }))
    .output(publicFindContactResponse)
    .handler(async ({ context, input }) => {
      const contact = await publicFindContact({
        id: input.contactId,
        chatbotId: context.chatbot.id,
      })

      if (!contact) {
        throw new NotfoundException("Contact not found")
      }

      return contact
    }),

  publicCreateContactAPI: chatbotTokenAPI
    .route({
      method: "POST",
      path: "/public/contacts",
      summary: "Create a contact",
      tags: ["Contacts"],
    })
    .input(createContactRequest)
    .output(publicFindContactResponse)
    .handler(async ({ context, input }) => {
      const contact = await createContact({
        chatbotId: context.chatbot.id,
        parsedInput: input,
      })

      const newContact = await publicFindContact({ id: contact.id })
      if (!newContact) {
        throw new NotfoundException("Contact not found")
      }
      return newContact
    }),

  publicListContactsByCustomFieldAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/contacts/find-by-custom-field",
      summary: "List contacts by custom field",
      description:
        "Find contacts by custom field value. It will return maximum 100 contacts. The results are sorted by the last custom field value update for a contact.",
      tags: ["Contacts"],
    })
    .input(publicListContactsByCustomFieldRequest)
    .output(publicListContactsResponse)
    .handler(async ({ context, input }) => {
      return await publicListContactsByCustomField({
        ...input,
        chatbotId: context.chatbot.id,
      })
    }),

  publicListContactTagsAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/contacts/{contactId}/tags",
      summary: "Get all tags added to this contact",
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: z.string() }))
    .output(publicLstTagsResponse)
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
      path: "/public/contacts/{contactId}/tags/{tagId}",
      summary: "Add a tag to the contact",
      tags: ["Contacts"],
      successStatus: 204,
    })
    .input(z.object({ contactId: z.string(), tagId: z.string() }))
    .handler(async ({ context, input }) => {
      await attachContactTag({
        chatbotId: context.chatbot.id,
        ...input,
      })
    }),

  publicDeleteContactTagAPI: chatbotTokenAPI
    .route({
      method: "DELETE",
      path: "/public/contacts/{contactId}/tags/{tagId}",
      summary: "Remove a tag from the contact",
      tags: ["Contacts"],
      successStatus: 204,
    })
    .input(removeContactTagRequest)
    .handler(async ({ context, input }) => {
      await detachContactTag({
        chatbotId: context.chatbot.id,
        ...input,
      })
    }),

  publicListContactCustomFieldsAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/contacts/{contactId}/custom-fields",
      summary: "Get all custom fields from a contact",
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: z.string() }))
    .output(listPublicContactCustomFieldsResponse)
    .handler(async ({ context, input }) => {
      const { contactId } = input
      return await listContactCustomFields({
        chatbotId: context.chatbot.id,
        contactId,
      })
    }),

  publicFindContactCustomFieldValueAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/contacts/{contactId}/custom-fields/{customFieldId}",
      summary: "Get contact custom field value",
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: z.string(), customFieldId: z.string() }))
    .output(publicContactCustomFieldResource)
    .handler(async ({ context, input }) => {
      const { contactId, customFieldId } = input
      const chatbotId = context.chatbot.id

      return await findContactCustomField({
        contactId,
        customFieldId,
        chatbotId,
      })
    }),

  publicSetContactCustomFieldValueAPI: chatbotTokenAPI
    .route({
      method: "POST",
      path: "/public/contacts/{contactId}/custom-fields",
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
      path: "/public/contacts/{contactId}/custom-fields/{customFieldId}",
      summary: "Delete contact custom field",
      tags: ["Contacts"],
      successStatus: 204,
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

  // publicSendTextMessageAPI: chatbotTokenAPI
  //   .route({
  //     method: "POST",
  //     path: "/public/contacts/{contactId}/send/text",
  //     summary: "Send text message to contact",
  //     tags: ["Contacts"],
  //   })
  //   .input(sendTextMessageRequest)
  //   .handler(async ({ context, input }) => {
  //     const { contactId, text, channel } = input
  //     const chatbotId = context.chatbot.id
  //     await sendTextMessage({
  //       chatbotId,
  //       contactId,
  //       channel,
  //       text,
  //     })
  //   }),
  // publicSendFileMessageAPI: chatbotTokenAPI
  //   .route({
  //     method: "POST",
  //     path: "/public/contacts/{contactId}/send/file",
  //     summary: "Send file message to contact",
  //     tags: ["Contacts"],
  //   })
  //   .input(sendFileMessageRequest)
  //   .handler(async ({ context, input }) => {
  //     const chatbotId = context.chatbot.id
  //     const { contactId, file, channel } = input
  //     await sendFileMessage({
  //       chatbotId,
  //       contactId,
  //       file,
  //       channel,
  //     })
  //   }),
  // publicSendFlowMessageAPI: chatbotTokenAPI
  //   .route({
  //     method: "POST",
  //     path: "/public/contacts/{contactId}/send/flow",
  //     summary: "Send flow message to contact",
  //     tags: ["Contacts"],
  //   })
  //   .input(sendFlowMessageRequest)
  //   .handler(async ({ context, input }) => {
  //     const chatbotId = context.chatbot.id
  //     const { contactId, flowId, channel } = input
  //     await sendFlowMessage({
  //       chatbotId,
  //       contactId,
  //       flowId,
  //       channel,
  //     })
  //   }),
}

export default publicAPIs
