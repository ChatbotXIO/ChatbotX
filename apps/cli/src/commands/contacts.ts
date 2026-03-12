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

type ContactParamKey =
  | "id"
  | "customFieldId"
  | "customFieldValue"
  | "value"
  | "tagId"
  | "channel"
  | "content"
  | "files"
  | "flowId"
  | "clientId"
  | "phoneNumber"
  | "email"
  | "gender"
  | "firstName"
  | "lastName"

type ContactCommandArg = CommandArg<ContactParamKey>

export type ContactCommandParams = Partial<Record<ContactParamKey, string>>

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
        key: "id",
        description: "Contact ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      getContactById(api, params.id ?? ""),
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
    execute: (api: ChatbotXAPI, params: ContactCommandParams) => {
      const customFieldId = params.customFieldId ?? ""
      const customFieldValue = params.customFieldValue ?? ""
      return listContactsByCustomField(api, customFieldId, customFieldValue)
    },
  },
  "contacts:list-tags-by-id": {
    name: "List tags of a contact by contact ID",
    args: [
      {
        key: "id",
        description: "Contact ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      listTagsByContactId(api, params.id ?? ""),
  },
  "contacts:add-tag": {
    name: "Add a tag to a contact",
    args: [
      {
        key: "id",
        description: "Contact ID",
        required: true,
      },
      {
        key: "tagId",
        description: "Tag ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) => {
      const contactId = params.id ?? ""
      const tagId = params.tagId ?? ""
      return addTagToContact(api, contactId, tagId)
    },
  },
  "contacts:delete-tag": {
    name: "Delete a tag from a contact",
    args: [
      {
        key: "id",
        description: "Contact ID",
        required: true,
      },
      {
        key: "tagId",
        description: "Tag ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) => {
      const contactId = params.id ?? ""
      const tagId = params.tagId ?? ""
      return deleteTagFromContact(api, contactId, tagId)
    },
  },
  "contacts:list-custom-fields-by-id": {
    name: "List custom fields of a contact by contact ID",
    args: [
      {
        key: "id",
        description: "Contact ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) =>
      listCustomFieldsByContactId(api, params.id ?? ""),
  },
  "contacts:get-custom-field-value": {
    name: "Get a contact's custom field value",
    args: [
      {
        key: "id",
        description: "Contact ID",
        required: true,
      },
      {
        key: "customFieldId",
        description: "Custom field ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) => {
      const contactId = params.id ?? ""
      const customFieldId = params.customFieldId ?? ""
      return getContactCustomFieldValue(api, contactId, customFieldId)
    },
  },
  "contacts:update-custom-field-value": {
    name: "Update a contact custom field value",
    args: [
      {
        key: "id",
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
    execute: (api: ChatbotXAPI, params: ContactCommandParams) => {
      const contactId = params.id ?? ""
      const customFieldId = params.customFieldId ?? ""
      const value = params.value ?? ""
      return updateContactCustomFieldValue(api, contactId, customFieldId, value)
    },
  },
  "contacts:delete-custom-field": {
    name: "Delete a contact custom field",
    args: [
      {
        key: "id",
        description: "Contact ID",
        required: true,
      },
      {
        key: "customFieldId",
        description: "Custom field ID",
        required: true,
      },
    ],
    execute: (api: ChatbotXAPI, params: ContactCommandParams) => {
      const contactId = params.id ?? ""
      const customFieldId = params.customFieldId ?? ""
      return deleteContactCustomField(api, contactId, customFieldId)
    },
  },
  "contacts:send-message": {
    name: "Send a message to a contact",
    args: [
      {
        key: "id",
        description: "Contact ID",
        required: true,
      },
      {
        key: "channel",
        description: "Channel (e.g. webchat)",
        required: true,
      },
      {
        key: "content",
        description: "Message content",
        required: true,
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
    execute: (api: ChatbotXAPI, params: ContactCommandParams) => {
      const contactId = params.id ?? ""
      const channel = params.channel ?? ""
      const content = params.content ?? ""
      const files = params.files
        ?.split(",")
        .map((file) => file.trim())
        .filter((file) => file.length > 0)

      return sendMessageToContact(api, contactId, {
        channel,
        content,
        files,
        flowId: params.flowId,
        clientId: params.clientId,
      })
    },
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
    execute: (api: ChatbotXAPI, params: ContactCommandParams) => {
      const phoneNumber = params.phoneNumber ?? ""
      const email = params.email ?? ""
      const gender = params.gender ?? "unknown"
      const firstName = params.firstName
      const lastName = params.lastName
      return createContact(api, {
        phoneNumber,
        email,
        gender: gender as "male" | "female" | "unknown",
        firstName,
        lastName,
      })
    },
  },
} satisfies Record<string, ContactCommand>
