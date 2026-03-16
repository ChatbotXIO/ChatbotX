import type { ChatbotXAPI } from "@chatbotx/public-apis"
import {
  addTagToContact,
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
import { createApiClient } from "../config"
import { type CommandArg, printResult, validateCommandArgs } from "./utils"

type ContactCommandParams = Partial<
  Omit<
    Parameters<typeof getContactById>[1] &
      Parameters<typeof listContactsByCustomField>[1] &
      Parameters<typeof listTagsByContactId>[1] &
      Parameters<typeof addTagToContact>[1] &
      Parameters<typeof deleteTagFromContact>[1] &
      Parameters<typeof listCustomFieldsByContactId>[1] &
      Parameters<typeof getContactCustomFieldValue>[1] &
      Parameters<typeof updateContactCustomFieldValue>[1] &
      Parameters<typeof deleteContactCustomField>[1] &
      Parameters<typeof sendMessageToContact>[1] &
      Parameters<typeof createContact>[1],
    "files"
  > & {
    files?: string
    customFieldValue?: string
  }
>

type ContactParamKey = keyof Required<ContactCommandParams>

type ContactCommandArg = CommandArg<ContactParamKey>

type ContactCommand = {
  name: string
  args: ContactCommandArg[]
  execute: (api: ChatbotXAPI, params: ContactCommandParams) => Promise<unknown>
}

export type ContactCommandName = keyof typeof contactCommands

export const executeContactCommand = async (
  commandName: ContactCommandName,
  params: ContactCommandParams = {},
): Promise<void> => {
  validateCommandArgs(commandName, params, contactCommands)
  const api = createApiClient()
  const result = await contactCommands[commandName].execute(api, params)
  printResult(result)
}

export const contactCommands = {
  "contacts:show": {
    name: "Get contact by ID",
    args: [
      {
        key: "contactId",
        description: "Contact ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      getContactById(api, { contactId: params.contactId ?? "" }),
  },
  "contacts:list-by-custom-field": {
    name: "List contacts by custom field value",
    args: [
      {
        key: "customFieldId",
        description: "Custom field ID",
        required: true,
      },
      {
        key: "customFieldValue",
        description: "Custom field value",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      listContactsByCustomField(api, {
        customFieldId: params.customFieldId ?? "",
        value: params.customFieldValue ?? "",
      }),
  },
  "contacts:list-tags": {
    name: "List tags of a contact",
    args: [
      {
        key: "contactId",
        description: "Contact ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      listTagsByContactId(api, { contactId: params.contactId ?? "" }),
  },
  "contacts:add-tag": {
    name: "Add a tag to a contact",
    args: [
      {
        key: "contactId",
        description: "Contact ID",
        required: true,
      },
      {
        key: "tagId",
        description: "Tag ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      addTagToContact(api, {
        contactId: params.contactId ?? "",
        tagId: params.tagId ?? "",
      }),
  },
  "contacts:delete-tag": {
    name: "Delete a tag from a contact",
    args: [
      {
        key: "contactId",
        description: "Contact ID",
        required: true,
      },
      {
        key: "tagId",
        description: "Tag ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      deleteTagFromContact(api, {
        contactId: params.contactId ?? "",
        tagId: params.tagId ?? "",
      }),
  },
  "contacts:list-custom-fields": {
    name: "List custom fields of a contact",
    args: [
      {
        key: "contactId",
        description: "Contact ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      listCustomFieldsByContactId(api, { contactId: params.contactId ?? "" }),
  },
  "contacts:get-custom-field-value": {
    name: "Get a contact's custom field value",
    args: [
      {
        key: "contactId",
        description: "Contact ID",
        required: true,
      },
      {
        key: "customFieldId",
        description: "Custom field ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      getContactCustomFieldValue(api, {
        contactId: params.contactId ?? "",
        customFieldId: params.customFieldId ?? "",
      }),
  },
  "contacts:update-custom-field-value": {
    name: "Update a contact custom field value",
    args: [
      {
        key: "contactId",
        description: "Contact ID",
        required: true,
      },
      {
        key: "customFieldId",
        description: "Custom field ID",
        required: true,
      },
      {
        key: "value",
        description: "Custom field value",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      updateContactCustomFieldValue(api, {
        contactId: params.contactId ?? "",
        customFieldId: params.customFieldId ?? "",
        value: params.value ?? "",
      }),
  },
  "contacts:delete-custom-field": {
    name: "Delete a contact custom field",
    args: [
      {
        key: "contactId",
        description: "Contact ID",
        required: true,
      },
      {
        key: "customFieldId",
        description: "Custom field ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      deleteContactCustomField(api, {
        contactId: params.contactId ?? "",
        customFieldId: params.customFieldId ?? "",
      }),
  },
  "contacts:send-message": {
    name: "Send a message to a contact",
    args: [
      {
        key: "contactId",
        description: "Contact ID",
        required: true,
      },
      {
        key: "channel",
        description: "Channel (webchat, messenger, whatsapp, zalo)",
        required: true,
      },
      {
        key: "content",
        description: "Message content",
        required: false,
      },
      {
        key: "files",
        description: "Comma-separated file identifiers",
        required: false,
      },
      {
        key: "flowId",
        description: "Flow ID",
        required: false,
      },
      {
        key: "clientId",
        description: "Client ID",
        required: false,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      sendMessageToContact(api, {
        contactId: params.contactId ?? "",
        channel: params.channel as
          | "webchat"
          | "messenger"
          | "whatsapp"
          | "zalo",
        content: params.content,
        files: params.files
          ?.split(",")
          .map((f) => f.trim())
          .filter((f) => f.length > 0),
        flowId: params.flowId,
        clientId: params.clientId,
      }),
  },
  "contacts:create": {
    name: "Create a new contact",
    args: [
      {
        key: "phoneNumber",
        description: "Phone number",
        required: true,
      },
      {
        key: "email",
        description: "Email address",
        required: true,
      },
      {
        key: "gender",
        description: "Gender (male, female, unknown)",
        required: true,
      },
      {
        key: "firstName",
        description: "First name",
        required: false,
      },
      {
        key: "lastName",
        description: "Last name",
        required: false,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      createContact(api, {
        phoneNumber: params.phoneNumber ?? "",
        email: params.email ?? "",
        gender: params.gender as "male" | "female" | "unknown",
        firstName: params.firstName,
        lastName: params.lastName,
      }),
  },
} satisfies Record<string, ContactCommand>
