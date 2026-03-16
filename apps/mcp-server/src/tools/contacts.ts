import {
  addTagToContact,
  type ChatbotXAPI,
  createContact,
  deleteContactCustomField,
  deleteTagFromContact,
  getContactById,
  getContactCustomFieldValue,
  listContactsByCustomField,
  listCustomFieldsByContactId,
  listTagsByContactId,
  sendMessageToContact,
  updateContactCustomFieldValue,
} from "@chatbotx/public-apis"
import { formatResult } from "../utils"

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown error"
}

export default {
  get_contact_by_id: {
    description: "Get a contact by its ID.",
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof getContactById>[1],
    ) => {
      try {
        const result = await getContactById(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof listContactsByCustomField>[1],
    ) => {
      try {
        const result = await listContactsByCustomField(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof listTagsByContactId>[1],
    ) => {
      try {
        const result = await listTagsByContactId(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof addTagToContact>[1],
    ) => {
      try {
        const result = await addTagToContact(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof deleteTagFromContact>[1],
    ) => {
      try {
        const result = await deleteTagFromContact(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof listCustomFieldsByContactId>[1],
    ) => {
      try {
        const result = await listCustomFieldsByContactId(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof getContactCustomFieldValue>[1],
    ) => {
      try {
        const result = await getContactCustomFieldValue(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof updateContactCustomFieldValue>[1],
    ) => {
      try {
        const result = await updateContactCustomFieldValue(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof deleteContactCustomField>[1],
    ) => {
      try {
        const result = await deleteContactCustomField(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof sendMessageToContact>[1],
    ) => {
      try {
        const result = await sendMessageToContact(api, input)

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
    execute: async (
      api: ChatbotXAPI,
      input: Parameters<typeof createContact>[1],
    ) => {
      try {
        const result = await createContact(api, input)

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
