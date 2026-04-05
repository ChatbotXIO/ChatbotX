import { db } from "@chatbotx.io/database/client"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { createMessage } from "@/features/messages/actions/create-message.action"
import { createMessageRequest } from "@/features/messages/schema/mutation"
import { publicListTagsResponse } from "@/features/tags/schema/query"
import { notFoundException } from "@/lib/errors/exception"
import { workspaceTokenAuthAPI } from "@/orpc"
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

export const workspaceTokenAuthAPIs = {
  findContactWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{contactId}",
      summary: "Get contact by contact id",
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: zodBigintAsString() }))
    .output(publicFindContactResponse)
    .handler(async ({ context, input }) => {
      const contact = await publicFindContact({
        id: input.contactId,
        workspaceId: context.workspace.id,
      })

      if (!contact) {
        throw notFoundException("Contact not found")
      }

      return contact
    }),

  createContactWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts",
      summary: "Create a contact",
      tags: ["Contacts"],
    })
    .input(createContactRequest)
    .output(publicFindContactResponse)
    .handler(async ({ context, input }) => {
      const contact = await createContact({
        workspaceId: context.workspace.id,
        parsedInput: input,
      })

      const newContact = await publicFindContact({ id: contact.id })
      if (!newContact) {
        throw notFoundException("Contact not found")
      }
      return newContact
    }),

  listContactsByCustomFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/find-by-custom-field",
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
        workspaceId: context.workspace.id,
      })
    }),

  listContactTagsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{contactId}/tags",
      summary: "Get all tags added to this contact",
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: zodBigintAsString() }))
    .output(publicListTagsResponse)
    .handler(async ({ context, input }) => {
      const { contactId } = input
      return await listContactTags({
        workspaceId: context.workspace.id,
        contactId,
      })
    }),

  addContactTagsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{contactId}/tags/{tagId}",
      summary: "Add a tag to the contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({ contactId: zodBigintAsString(), tagId: zodBigintAsString() }),
    )
    .handler(async ({ context, input }) => {
      await attachContactTag({
        workspaceId: context.workspace.id,
        ...input,
      })
    }),

  deleteContactTagWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{contactId}/tags/{tagId}",
      summary: "Remove a tag from the contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(removeContactTagRequest)
    .handler(async ({ context, input }) => {
      await detachContactTag({
        workspaceId: context.workspace.id,
        ...input,
      })
    }),

  listContactCustomFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{contactId}/custom-fields",
      summary: "Get all custom fields from a contact",
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: zodBigintAsString() }))
    .output(listPublicContactCustomFieldsResponse)
    .handler(async ({ context, input }) => {
      const { contactId } = input
      return await listContactCustomFields({
        workspaceId: context.workspace.id,
        contactId,
      })
    }),

  findContactCustomFieldValueWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{contactId}/custom-fields/{customFieldId}",
      summary: "Get contact custom field value",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        contactId: zodBigintAsString(),
        customFieldId: zodBigintAsString(),
      }),
    )
    .output(publicContactCustomFieldResource)
    .handler(async ({ context, input }) => {
      const { contactId, customFieldId } = input
      const workspaceId = context.workspace.id

      return await findContactCustomField({
        contactId,
        customFieldId,
        workspaceId,
      })
    }),

  setContactCustomFieldValueWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{contactId}/custom-fields/{customFieldId}",
      summary: "Set contact custom field value",
      tags: ["Contacts"],
    })
    .input(setContactCustomFieldValueRequest)
    .handler(async ({ context, input }) => {
      const { contactId } = input
      const workspaceId = context.workspace.id

      await setContactCustomFieldValue({
        workspaceId,
        contactId,
        customFieldId: input.customFieldId,
        value: input.value,
      })
    }),

  deleteContactCustomFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{contactId}/custom-fields/{customFieldId}",
      summary: "Delete contact custom field",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(deleteContactCustomFieldRequest)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const { contactId, customFieldId } = input
      await deleteContactCustomFields({
        workspaceId,
        contactIds: [contactId],
        customFieldId,
      })
    }),

  sendMessageWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{contactId}/messages",
      summary: "Send message to contact",
      tags: ["Contacts"],
    })
    .input(
      createMessageRequest.and(
        z.object({
          contactId: zodBigintAsString(),
        }),
      ),
    )
    .handler(async ({ input }) => {
      const conversation = await db.query.conversationModel.findFirst({
        where: {
          contactId: input.contactId,
          contactInboxes: {
            channel: input.inboxId,
          },
        },
        with: {
          contactInboxes: true,
        },
      })
      if (!conversation) {
        throw notFoundException("Conversation not found")
      }

      const contactInbox = input.inboxId
        ? conversation.contactInboxes.find((ci) => ci.inboxId === input.inboxId)
        : conversation.contactInboxes[0]
      if (!contactInbox) {
        throw notFoundException("Conversation not found")
      }

      await createMessage({
        conversation,
        contactInbox,
        parsedInput: input,
      })
    }),
}

export default workspaceTokenAuthAPIs
