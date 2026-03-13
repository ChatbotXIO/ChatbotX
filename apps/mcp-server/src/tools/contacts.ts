import {
  addTagToContact,
  type ChatbotXAPI,
  contactCustomFieldInputSchema,
  createContact,
  createContactInputSchema,
  deleteContactCustomField,
  deleteContactCustomFieldInputSchema,
  deleteTagFromContact,
  getContactById,
  getContactByIdInputSchema,
  getContactCustomFieldValue,
  listContactsByCustomField,
  listContactsByCustomFieldInputSchema,
  listCustomFieldsByContactId,
  listCustomFieldsByContactIdInputSchema,
  listTagsByContactId,
  listTagsByContactIdInputSchema,
  sendMessageToContact,
  sendMessageToContactInputSchema,
  updateContactCustomFieldValue,
  updateContactCustomFieldValueInputSchema,
  updateContactTagInputSchema,
} from "@chatbotx/public-apis"
import { formatResult } from "../utils"

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown error"
}

export default {
  get_contact_by_id: {
    description: "Get a contact by its ID.",
    inputSchema: getContactByIdInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = getContactByIdInputSchema.parse(input)
        const result = await getContactById(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Contact details:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch contact: ${message}`,
            },
          ],
        }
      }
    },
  },
  list_contacts_by_custom_field: {
    description: "Find contacts by custom field and value.",
    inputSchema: listContactsByCustomFieldInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = listContactsByCustomFieldInputSchema.parse(input)
        const result = await listContactsByCustomField(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Contact list:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch contacts: ${message}`,
            },
          ],
        }
      }
    },
  },
  list_tags_by_contact_id: {
    description: "Get all tags for a contact.",
    inputSchema: listTagsByContactIdInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = listTagsByContactIdInputSchema.parse(input)
        const result = await listTagsByContactId(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Contact tags:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch contact tags: ${message}`,
            },
          ],
        }
      }
    },
  },
  add_tag_to_contact: {
    description: "Add a tag to a contact.",
    inputSchema: updateContactTagInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = updateContactTagInputSchema.parse(input)
        const result = await addTagToContact(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Tag added to contact successfully:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to add tag to contact: ${message}`,
            },
          ],
        }
      }
    },
  },
  delete_tag_from_contact: {
    description: "Delete a tag from a contact.",
    inputSchema: updateContactTagInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = updateContactTagInputSchema.parse(input)
        const result = await deleteTagFromContact(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Tag removed from contact successfully:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to remove tag from contact: ${message}`,
            },
          ],
        }
      }
    },
  },
  list_custom_fields_by_contact_id: {
    description: "Get all custom fields of a contact.",
    inputSchema: listCustomFieldsByContactIdInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput =
          listCustomFieldsByContactIdInputSchema.parse(input)
        const result = await listCustomFieldsByContactId(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Contact custom fields:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch contact custom fields: ${message}`,
            },
          ],
        }
      }
    },
  },
  get_contact_custom_field_value: {
    description: "Get a custom field value of a contact.",
    inputSchema: contactCustomFieldInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = contactCustomFieldInputSchema.parse(input)
        const result = await getContactCustomFieldValue(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Contact custom field value:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to fetch contact custom field value: ${message}`,
            },
          ],
        }
      }
    },
  },
  update_contact_custom_field_value: {
    description: "Update a custom field value for a contact.",
    inputSchema: updateContactCustomFieldValueInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput =
          updateContactCustomFieldValueInputSchema.parse(input)
        const result = await updateContactCustomFieldValue(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Contact custom field updated successfully:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to update contact custom field: ${message}`,
            },
          ],
        }
      }
    },
  },
  delete_contact_custom_field: {
    description: "Delete a custom field from a contact.",
    inputSchema: deleteContactCustomFieldInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = deleteContactCustomFieldInputSchema.parse(input)
        const result = await deleteContactCustomField(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Contact custom field deleted successfully:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to delete contact custom field: ${message}`,
            },
          ],
        }
      }
    },
  },
  send_message_to_contact: {
    description: "Send a message to a contact.",
    inputSchema: sendMessageToContactInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = sendMessageToContactInputSchema.parse(input)
        const result = await sendMessageToContact(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Message sent successfully:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to send message: ${message}`,
            },
          ],
        }
      }
    },
  },
  create_contact: {
    description: "Create a new contact.",
    inputSchema: createContactInputSchema,
    execute: async (api: ChatbotXAPI, input: unknown) => {
      try {
        const validatedInput = createContactInputSchema.parse(input)
        const result = await createContact(api, validatedInput)

        return {
          content: [
            {
              type: "text" as const,
              text: `Contact created successfully:\n${formatResult(result)}`,
            },
          ],
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error)

        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to create contact: ${message}`,
            },
          ],
        }
      }
    },
  },
}
