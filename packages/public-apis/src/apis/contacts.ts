import { z } from "zod"

import type { paths } from "../generated/chatbotx"
import type { ChatbotXAPI } from "../lib/api"

type GetContactByIdPathParams =
  paths["/v1/contacts/{contactId}"]["get"]["parameters"]["path"]
type GetContactByIdResponse =
  paths["/v1/contacts/{contactId}"]["get"]["responses"]["200"]["content"]["application/json"]

type ListContactsByCustomFieldQueryParams =
  paths["/v1/contacts/find-by-custom-field"]["get"]["parameters"]["query"]
type ListContactsByCustomFieldResponse =
  paths["/v1/contacts/find-by-custom-field"]["get"]["responses"]["200"]["content"]["application/json"]

type ListTagsByContactIdPathParams =
  paths["/v1/contacts/{contactId}/tags"]["get"]["parameters"]["path"]
type ListTagsByContactIdResponse =
  paths["/v1/contacts/{contactId}/tags"]["get"]["responses"]["200"]["content"]["application/json"]

type UpdateContactTagPathParams =
  paths["/v1/contacts/{contactId}/tags/{tagId}"]["post"]["parameters"]["path"]
type UpdateContactTagInput = UpdateContactTagPathParams

type ListCustomFieldsByContactIdPathParams =
  paths["/v1/contacts/{contactId}/custom-fields"]["get"]["parameters"]["path"]
type ListCustomFieldsByContactIdResponse =
  paths["/v1/contacts/{contactId}/custom-fields"]["get"]["responses"]["200"]["content"]["application/json"]

type ContactCustomFieldPathParams =
  paths["/v1/contacts/{contactId}/custom-fields/{customFieldId}"]["get"]["parameters"]["path"]
type ContactCustomFieldResponse =
  paths["/v1/contacts/{contactId}/custom-fields/{customFieldId}"]["get"]["responses"]["200"]["content"]["application/json"]

type UpdateContactCustomFieldValuePathParams =
  paths["/v1/contacts/{contactId}/custom-fields/{customFieldId}"]["post"]["parameters"]["path"]
type UpdateContactCustomFieldValueBody =
  paths["/v1/contacts/{contactId}/custom-fields/{customFieldId}"]["post"]["requestBody"]["content"]["application/json"]
type UpdateContactCustomFieldValueInput =
  UpdateContactCustomFieldValuePathParams & UpdateContactCustomFieldValueBody

type DeleteContactCustomFieldPathParams =
  paths["/v1/contacts/{contactId}/custom-fields/{customFieldId}"]["delete"]["parameters"]["path"]

type SendMessageToContactPathParams =
  paths["/v1/contacts/{contactId}/messages"]["post"]["parameters"]["path"]
type SendMessageToContactBody =
  paths["/v1/contacts/{contactId}/messages"]["post"]["requestBody"]["content"]["application/json"]
type SendMessageToContactInput = SendMessageToContactPathParams &
  SendMessageToContactBody

type CreateContactBody =
  paths["/v1/contacts"]["post"]["requestBody"]["content"]["application/json"]
type CreateContactResponse =
  paths["/v1/contacts"]["post"]["responses"]["200"]["content"]["application/json"]

export const getContactByIdInputSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
})

export const listContactsByCustomFieldInputSchema = z.object({
  customFieldId: z.string().min(1, "customFieldId is required"),
  value: z.string().min(1, "value is required"),
})

export const listTagsByContactIdInputSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
})

export const updateContactTagInputSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  tagId: z.string().min(1, "tagId is required"),
})

export const listCustomFieldsByContactIdInputSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
})

export const contactCustomFieldInputSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  customFieldId: z.string().min(1, "customFieldId is required"),
})

export const updateContactCustomFieldValueInputSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  customFieldId: z.string().min(1, "customFieldId is required"),
  value: z.string(),
})

export const deleteContactCustomFieldInputSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  customFieldId: z.string().min(1, "customFieldId is required"),
})

export const sendMessageToContactInputSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  channel: z.enum(["webchat", "messenger", "whatsapp", "zalo"]),
  content: z.string().optional(),
  files: z.array(z.unknown()).optional(),
  flowId: z.string().optional(),
  clientId: z.string().optional(),
})

export const createContactInputSchema = z.object({
  phoneNumber: z.string().min(1, "phoneNumber is required"),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  gender: z.enum(["unknown", "male", "female"]),
})

export const getContactById = (
  api: ChatbotXAPI,
  input: GetContactByIdPathParams,
): Promise<GetContactByIdResponse> => {
  return api
    .getClient()
    .get(`contacts/${input.contactId}`)
    .json<GetContactByIdResponse>()
}

export const listContactsByCustomField = (
  api: ChatbotXAPI,
  input: ListContactsByCustomFieldQueryParams,
): Promise<ListContactsByCustomFieldResponse> => {
  return api
    .getClient()
    .get("contacts/find-by-custom-field", {
      searchParams: {
        customFieldId: input.customFieldId,
        value: input.value,
      },
    })
    .json<ListContactsByCustomFieldResponse>()
}

export const listTagsByContactId = (
  api: ChatbotXAPI,
  input: ListTagsByContactIdPathParams,
): Promise<ListTagsByContactIdResponse> => {
  return api
    .getClient()
    .get(`contacts/${input.contactId}/tags`)
    .json<ListTagsByContactIdResponse>()
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
  input: ListCustomFieldsByContactIdPathParams,
): Promise<ListCustomFieldsByContactIdResponse> => {
  return api
    .getClient()
    .get(`contacts/${input.contactId}/custom-fields`)
    .json<ListCustomFieldsByContactIdResponse>()
}

export const getContactCustomFieldValue = (
  api: ChatbotXAPI,
  input: ContactCustomFieldPathParams,
): Promise<ContactCustomFieldResponse> => {
  return api
    .getClient()
    .get(`contacts/${input.contactId}/custom-fields/${input.customFieldId}`)
    .json<ContactCustomFieldResponse>()
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
  input: DeleteContactCustomFieldPathParams,
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
  input: CreateContactBody,
): Promise<CreateContactResponse> => {
  return api
    .getClient()
    .post("contacts", {
      json: input,
    })
    .json<CreateContactResponse>()
}
