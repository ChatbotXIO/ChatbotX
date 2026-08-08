import {
  automatedResponseService,
  contactCustomFieldService,
  contactService,
  conversationService,
  tagService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { contactSources, genderTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { createMessage } from "@/features/messages/actions/create-message.action"
import {
  listMessages,
  publicFindContactMessage,
} from "@/features/messages/queries"
import { createMessageRequest } from "@/features/messages/schema/mutation"
import { listMessagesResponse } from "@/features/messages/schema/query"
import { messageResourceWithRelations } from "@/features/messages/schema/resource"
import { publicListTagsResponse } from "@/features/tags/schema/query"
import { workspaceTokenAuthAPI } from "@/orpc"
import { setContactCustomFieldValue } from "../actions/add-contact-custom-field.action"
import { blockContact } from "../actions/block-contact.action"
import { createContact } from "../actions/create-contact.action"
import { deleteContact } from "../actions/delete-contact.action"
import { unblockContact } from "../actions/unblock-contact.action"
import { updateContactFields } from "../actions/update-contact-field.action"
import { contactImportService } from "../contact-import.service"
import {
  findContactCustomField,
  listContactCustomFields,
} from "../queries/list-contact-fields.query"
import { listContactTags } from "../queries/list-contact-tags.query"
import { listContactsForAPI } from "../queries/list-contacts.queries"
import {
  publicFindContact,
  publicListContactsByCustomField,
  resolveContactId,
} from "../queries/public-find-contact"
import {
  createContactRequest,
  updateContactFieldRequest,
} from "../schemas/action"
import {
  listPublicContactCustomFieldsResponse,
  publicContactCustomFieldResource,
} from "../schemas/contact-custom-field"
import { importContactsRequest } from "../schemas/contact-import"
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
        await listContactsForAPI({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  getContactWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}",
      summary:
        "Get contact by identifier (id:123, email:user@example.com, phone:+84...)",
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .output(contactResponse)
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const contact = await publicFindContact({
        id: contactId,
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
      const newContact = await publicFindContact({
        id: contact.id,
        workspaceId: context.workspace.id,
      })
      if (!newContact) {
        throw notFoundException("Contact not found")
      }
      return newContact
    }),

  filterContactsWorkspaceTokenAPI: workspaceTokenAuthAPI
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
      path: "/v1/contacts/{identifier}/tags",
      summary: "Get all tags added to this contact",
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .output(publicListTagsResponse)
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      return await listContactTags({
        workspaceId: context.workspace.id,
        contactId,
      })
    }),

  addContactTagsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/tags",
      summary: "Add tags to the contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        tagIds: z.array(zodBigintAsString()).min(1).max(100),
      }),
    )
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await tagService.attachToContact({
        workspaceId: context.workspace.id,
        contactId,
        tagIds: input.tagIds,
      })
    }),

  removeContactTagsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}/tags",
      summary: "Remove tags from the contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        tagIds: z.array(zodBigintAsString()).min(1).max(100),
      }),
    )
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await tagService.detachFromContact({
        workspaceId: context.workspace.id,
        contactId,
        tagIds: input.tagIds,
      })
    }),

  listContactCustomFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/custom-fields",
      summary: "Get all custom fields from a contact",
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .output(listPublicContactCustomFieldsResponse)
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      return await listContactCustomFields({
        workspaceId: context.workspace.id,
        contactId,
      })
    }),

  getContactCustomFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/custom-fields/{customFieldId}",
      summary: "Get contact custom field value",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        customFieldId: zodBigintAsString(),
      }),
    )
    .output(publicContactCustomFieldResource)
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      return await findContactCustomField({
        contactId,
        customFieldId: input.customFieldId,
        workspaceId: context.workspace.id,
      })
    }),

  setContactCustomFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/custom-fields/{customFieldId}",
      summary: "Set contact custom field value",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        customFieldId: zodBigintAsString(),
        value: z.string().trim(),
      }),
    )
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await setContactCustomFieldValue({
        workspaceId: context.workspace.id,
        contactId,
        customFieldId: input.customFieldId,
        value: input.value,
      })
    }),

  setContactCustomFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/contacts/{identifier}/custom-fields",
      summary: "Set multiple custom field values for a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        fields: z
          .array(
            z.object({
              customFieldId: zodBigintAsString(),
              value: z.string().trim(),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await contactCustomFieldService.setValues({
        workspaceId: context.workspace.id,
        contactId,
        fields: input.fields,
      })
    }),

  clearContactCustomFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}/custom-fields/{idOrName}",
      summary: "Delete contact custom field by id or name",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        idOrName: z.string().min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await contactCustomFieldService.deleteByKey({
        workspaceId: context.workspace.id,
        contactId,
        keyword: input.idOrName,
      })
    }),

  blockContactWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/block",
      summary: "Block a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await blockContact({
        workspaceId: context.workspace.id,
        id: contactId,
      })
    }),

  unblockContactWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/unblock",
      summary: "Unblock a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await unblockContact({
        workspaceId: context.workspace.id,
        id: contactId,
      })
    }),

  deleteContactWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}",
      summary: "Delete a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await deleteContact({
        workspaceId: context.workspace.id,
        ids: [contactId],
      })
    }),

  sendMessageWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/messages",
      summary: "Send message to contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      createMessageRequest.and(
        z.object({
          identifier: z.string().min(1),
        }),
      ),
    )
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const conversation = await conversationService.findByContactWithInboxes({
        contactId,
        workspaceId: context.workspace.id,
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

  listContactMessagesWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/messages",
      summary: "List messages for contact",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        perPage: z.coerce.number().optional().default(20),
        cursor: z.string().optional(),
      }),
    )
    .output(listMessagesResponse)
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const conversation = await conversationService.findByContactWithInboxes({
        contactId,
        workspaceId: context.workspace.id,
      })
      if (!conversation) {
        throw notFoundException("Conversation not found")
      }
      return await listMessages({
        workspaceId: context.workspace.id,
        conversationId: conversation.id,
        perPage: input.perPage,
        cursor: input.cursor,
      })
    }),

  getContactMessageWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/messages/{messageId}",
      summary: "Get a message by ID for a contact",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        messageId: zodBigintAsString(),
      }),
    )
    .output(messageResourceWithRelations)
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const conversation = await conversationService.findByContactWithInboxes({
        contactId,
        workspaceId: context.workspace.id,
      })
      if (!conversation) {
        throw notFoundException("Conversation not found")
      }
      return publicFindContactMessage({
        messageId: input.messageId,
        conversationId: conversation.id,
        workspaceId: context.workspace.id,
      })
    }),

  triggerAutoReplyWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/auto-replies",
      summary: "Trigger auto reply for contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        keyword: z.string().min(1),
        inboxId: zodBigintAsString().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const autoReply = await automatedResponseService.findByInboundKeyword(
        context.workspace.id,
        input.keyword,
      )
      if (!autoReply) {
        throw notFoundException("No automated response found for this keyword")
      }

      const conversation = await conversationService.findByContactWithInboxes({
        contactId,
        workspaceId: context.workspace.id,
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

      const parsedInput = autoReply.flowId
        ? { flowId: autoReply.flowId, inboxId: input.inboxId }
        : { text: autoReply.text ?? "", inboxId: input.inboxId }

      await createMessage({ conversation, contactInbox, parsedInput })
    }),

  sendContactFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/flows",
      summary: "Send flow to contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        flowId: zodBigintAsString(),
        inboxId: zodBigintAsString().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const conversation = await conversationService.findByContactWithInboxes({
        contactId,
        workspaceId: context.workspace.id,
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
        parsedInput: { flowId: input.flowId, inboxId: input.inboxId },
      })
    }),

  importContactsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/import",
      summary: "Import contacts from a file",
      successStatus: 201,
      tags: ["Contacts"],
    })
    .input(importContactsRequest)
    .handler(
      async ({ context, input }) =>
        await contactImportService.startImport(context.workspace.id, input),
    ),

  updateContactWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/contacts/{identifier}",
      summary: "Update contact fields",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z
        .object({ identifier: z.string().min(1) })
        .and(updateContactFieldRequest),
    )
    .handler(async ({ context, input }) => {
      const { identifier, ...fields } = input
      const contactId = await resolveContactId({
        identifier,
        workspaceId: context.workspace.id,
      })
      await updateContactFields(
        { workspaceId: context.workspace.id, id: contactId },
        fields,
      )
    }),

  clearContactCustomFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}/custom-fields",
      summary: "Clear all custom fields from a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const contactId = await resolveContactId({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await contactCustomFieldService.clearByContactId({
        workspaceId: context.workspace.id,
        contactId,
      })
    }),

  upsertContactWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/upsert",
      summary: "Upsert a contact by identifier",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        firstName: z.string().trim().max(100).optional(),
        lastName: z.string().trim().max(100).optional(),
        email: z.union([z.literal(""), z.email().max(100)]).optional(),
        phoneNumber: z
          .string()
          .min(10)
          .max(20)
          .regex(/\+?\d{10,20}/)
          .optional(),
        avatar: z.string().optional(),
        gender: genderTypes.optional(),
      }),
    )
    .output(contactResponse)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const { identifier, avatar, ...fields } = input

      const { contact } = await contactService.upsertByIdentifier({
        workspaceId,
        identifier,
        avatar,
        source: contactSources.enum.api,
        data: {
          ...(fields.firstName !== undefined && {
            firstName: fields.firstName,
          }),
          ...(fields.lastName !== undefined && { lastName: fields.lastName }),
          ...(fields.email !== undefined && { email: fields.email }),
          ...(fields.phoneNumber !== undefined && {
            phoneNumber: fields.phoneNumber,
          }),
          ...(fields.gender !== undefined && { gender: fields.gender }),
        },
      })

      const result = await publicFindContact({ id: contact.id, workspaceId })
      if (!result) {
        throw notFoundException("Contact not found")
      }
      return result
    }),
}

export default workspaceTokenAuthAPIs
