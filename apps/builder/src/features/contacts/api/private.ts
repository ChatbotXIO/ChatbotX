import { withChatbotIdSchema } from "@/features/chatbots/schemas/resource"
import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { addContactTags } from "../actions/add-contact-tag.action"
import { createContact } from "../actions/create-contact.action"
import { listContactTags } from "../queries/list-contact-tags.query"
import { listContacts } from "../queries/list-contacts.queries"
import { createContactRequest } from "../schemas/action"
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
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      const { chatbotId, ...parsedInput } = input
      await createContact({ chatbotId, parsedInput })
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
      path: "/chatbots/{chatbotId}/contacts/tags",
      summary: "Remove tags from contact",
      tags: ["Contacts"],
    })
    .input(removeContactTagRequest.and(withChatbotIdSchema))
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
}

export default privateAPIs
