import { z } from "zod"
import { chatbotTokenAPI } from "@/orpc"
import { addContactTags } from "../actions/add-contact-tag.action"
import { createContact } from "../actions/create-contact.action"
import { listContactTags } from "../queries/list-contact-tags.query"
import { listContacts } from "../queries/list-contacts.queries"
import { createContactRequest } from "../schemas/action"
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
    .handler(async ({ context, input }) => {
      await createContact({ chatbotId: context.chatbot.id, parsedInput: input })
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
      path: "/public/chatbots/contacts/tags",
      summary: "Remove contact tags",
      tags: ["Contacts"],
    })
    .input(removeContactTagRequest)
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
}

export default publicAPIs
