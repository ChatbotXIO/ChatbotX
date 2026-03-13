import type { paths } from "../generated/chatbotx"
import type { ChatbotXAPI } from "../lib/api"
import type {
  Contact,
  FindContactRequest,
  FindContactsByCustomFieldRequest,
} from "../schemas/contact"
import type { ContactCustomField } from "../schemas/custom-field"
import type { Tag } from "../schemas/tag"

type ListTagsByContactIdInput =
  paths["/v1/contacts/{contactId}/tags"]["get"]["parameters"]["path"]

type UpdateContactTagPathParams =
  paths["/v1/contacts/{contactId}/tags/{tagId}"]["post"]["parameters"]["path"]
type UpdateContactTagInput = UpdateContactTagPathParams

type ListCustomFieldsByContactIdInput =
  paths["/v1/contacts/{contactId}/custom-fields"]["get"]["parameters"]["path"]

type ContactCustomFieldPathParams =
  paths["/v1/contacts/{contactId}/custom-fields/{customFieldId}"]["get"]["parameters"]["path"]
type ContactCustomFieldInput = ContactCustomFieldPathParams

type UpdateContactCustomFieldValuePathParams =
  paths["/v1/contacts/{contactId}/custom-fields/{customFieldId}"]["post"]["parameters"]["path"]
type UpdateContactCustomFieldValueBody =
  paths["/v1/contacts/{contactId}/custom-fields/{customFieldId}"]["post"]["requestBody"]["content"]["application/json"]
type UpdateContactCustomFieldValueInput =
  UpdateContactCustomFieldValuePathParams & UpdateContactCustomFieldValueBody

type SendMessageToContactPathParams =
  paths["/v1/contacts/{contactId}/messages"]["post"]["parameters"]["path"]
type SendMessageToContactBody =
  paths["/v1/contacts/{contactId}/messages"]["post"]["requestBody"]["content"]["application/json"]
type SendMessageToContactInput = SendMessageToContactPathParams &
  SendMessageToContactBody

type CreateContactInput =
  paths["/v1/contacts"]["post"]["requestBody"]["content"]["application/json"]

export const getContactById = (
  api: ChatbotXAPI,
  input: FindContactRequest,
): Promise<Contact> => {
  return api.getClient().get(`contacts/${input.id}`).json<Contact>()
}

export const listContactsByCustomField = (
  api: ChatbotXAPI,
  input: FindContactsByCustomFieldRequest,
): Promise<{ data: Contact[] }> => {
  return api
    .getClient()
    .get("contacts/find-by-custom-field", {
      searchParams: {
        customFieldId: input.customFieldId,
        value: input.value,
      },
    })
    .json<{ data: Contact[] }>()
}

export const listTagsByContactId = (
  api: ChatbotXAPI,
  input: ListTagsByContactIdInput,
): Promise<{ data: Tag[] }> => {
  return api
    .getClient()
    .get(`contacts/${input.contactId}/tags`)
    .json<{ data: Tag[] }>()
}

export const addTagToContact = (
  api: ChatbotXAPI,
  input: UpdateContactTagInput,
): Promise<unknown> => {
  return api
    .getClient()
    .post(`contacts/${input.contactId}/tags/${input.tagId}`, { json: {} })
    .json()
}

export const deleteTagFromContact = (
  api: ChatbotXAPI,
  input: UpdateContactTagInput,
): Promise<unknown> => {
  return api
    .getClient()
    .delete(`contacts/${input.contactId}/tags/${input.tagId}`, { json: {} })
    .json()
}

export const listCustomFieldsByContactId = (
  api: ChatbotXAPI,
  input: ListCustomFieldsByContactIdInput,
): Promise<{ data: ContactCustomField[] }> => {
  return api
    .getClient()
    .get(`contacts/${input.contactId}/custom-fields`)
    .json<{ data: ContactCustomField[] }>()
}

export const getContactCustomFieldValue = (
  api: ChatbotXAPI,
  input: ContactCustomFieldInput,
): Promise<ContactCustomField> => {
  return api
    .getClient()
    .get(`contacts/${input.contactId}/custom-fields/${input.customFieldId}`)
    .json<ContactCustomField>()
}

export const updateContactCustomFieldValue = (
  api: ChatbotXAPI,
  input: UpdateContactCustomFieldValueInput,
): Promise<unknown> => {
  return api
    .getClient()
    .post(`contacts/${input.contactId}/custom-fields/${input.customFieldId}`, {
      json: { value: input.value },
    })
    .json()
}

export const deleteContactCustomField = (
  api: ChatbotXAPI,
  input: ContactCustomFieldInput,
): Promise<unknown> => {
  return api
    .getClient()
    .delete(
      `contacts/${input.contactId}/custom-fields/${input.customFieldId}`,
      {
        json: {},
      },
    )
    .json()
}

export const sendMessageToContact = (
  api: ChatbotXAPI,
  input: SendMessageToContactInput,
): Promise<unknown> => {
  return api
    .getClient()
    .post(`contacts/${input.contactId}/messages`, {
      json: {
        channel: input.channel,
        content: input.content,
        files: input.files,
        flowId: input.flowId,
        clientId: input.clientId,
      },
    })
    .json()
}

export const createContact = (
  api: ChatbotXAPI,
  input: CreateContactInput,
): Promise<Contact> => {
  return api
    .getClient()
    .post("contacts", {
      json: input,
    })
    .json<Contact>()
}
