import { notFoundException } from "@chatbotx.io/business/errors"
import { db } from "@chatbotx.io/database/client"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { createMessage } from "@/features/messages/actions/create-message.service"
import { createMessageRequest } from "@/features/messages/schema/mutation"
import { publicListTagsResponse } from "@/features/tags/schema/query"
import { workspaceTokenAuthAPI } from "@/orpc"
import {
  setContactCustomFieldValue,
  setContactCustomFieldValues,
} from "../actions/add-contact-custom-field.action"
import {
  attachContactTags,
  detachContactTags,
} from "../actions/add-contact-tag.action"
import { blockContact } from "../actions/block-contact.action"
import { createContact } from "../actions/create-contact.action"
import { deleteContacts } from "../actions/delete-contact.action"
import {
  deleteContactCustomFields,
  deleteContactCustomFieldsByFields,
} from "../actions/delete-contact-custom-field.action"
import { unblockContact } from "../actions/unblock-contact.action"
import {
  findContactCustomField,
  listContactCustomFields,
} from "../queries/list-contact-fields.query"
import { listContactTags } from "../queries/list-contact-tags.query"
import { listContacts } from "../queries/list-contacts.queries"
import {
  publicFindContact,
  publicListContactsByCustomField,
} from "../queries/public-find-contact"
import { createContactRequest } from "../schemas/action"
import {
  deleteBulkContactCustomFieldsRequest,
  deleteContactCustomFieldRequest,
  listPublicContactCustomFieldsResponse,
  publicContactCustomFieldResource,
  setBulkContactCustomFieldsRequest,
  setContactCustomFieldValueRequest,
} from "../schemas/contact-custom-field"
import {
  contactResponse,
  listContactsRequest,
  listContactsResponse,
  publicListContactsByCustomFieldRequest,
  publicListContactsResponse,
} from "../schemas/query"

export const workspaceTokenAuthAPIs = {
  listContactsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts",
      summary: "List contacts",
      tags: ["Contacts"],
    })
    .input(listContactsRequest.omit({ workspaceId: true }))
    .output(listContactsResponse)
    .handler(
      async ({ context, input }) =>
        await listContacts({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  findContactWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{contactId}",
      summary: "Get contact by contact id",
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: zodBigintAsString() }))
    .output(contactResponse)
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
    .output(contactResponse)
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
    .handler(
      async ({ context, input }) =>
        await publicListContactsByCustomField({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

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
      path: "/v1/contacts/{contactId}/tags",
      summary: "Add tags to the contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        contactId: zodBigintAsString(),
        tagIds: z.array(zodBigintAsString()).min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      await attachContactTags({
        workspaceId: context.workspace.id,
        contactId: input.contactId,
        tagIds: input.tagIds,
      })
    }),

  deleteContactTagsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{contactId}/tags",
      summary: "Remove tags from the contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        contactId: zodBigintAsString(),
        tagIds: z.array(zodBigintAsString()).min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      await detachContactTags({
        workspaceId: context.workspace.id,
        contactId: input.contactId,
        tagIds: input.tagIds,
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

  setBulkContactCustomFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/contacts/{contactId}/custom-fields",
      summary: "Set multiple custom field values for a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(setBulkContactCustomFieldsRequest)
    .handler(async ({ context, input }) => {
      await setContactCustomFieldValues({
        workspaceId: context.workspace.id,
        contactId: input.contactId,
        fields: input.fields,
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

  deleteBulkContactCustomFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{contactId}/custom-fields",
      summary: "Delete multiple custom fields from a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(deleteBulkContactCustomFieldsRequest)
    .handler(async ({ context, input }) => {
      await deleteContactCustomFieldsByFields({
        workspaceId: context.workspace.id,
        contactId: input.contactId,
        keys: input.keys,
      })
    }),

  blockContactWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{contactId}/block",
      summary: "Block a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: zodBigintAsString() }))
    .handler(async ({ context, input }) => {
      await blockContact({
        workspaceId: context.workspace.id,
        id: input.contactId,
      })
    }),

  unblockContactWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{contactId}/unblock",
      summary: "Unblock a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: zodBigintAsString() }))
    .handler(async ({ context, input }) => {
      await unblockContact({
        workspaceId: context.workspace.id,
        id: input.contactId,
      })
    }),

  deleteContactsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{contactId}",
      summary: "Delete a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: zodBigintAsString() }))
    .handler(async ({ context, input }) => {
      await deleteContacts({
        workspaceId: context.workspace.id,
        ids: [input.contactId],
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
