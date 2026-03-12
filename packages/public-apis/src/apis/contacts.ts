import type { ChatbotXAPI } from "../lib/api"
import type { Contact } from "../schemas/contact"
import type { ContactCustomField } from "../schemas/custom-field"
import type { Tag } from "../schemas/tag"

const CONTACTS_PREFIX = "/contacts"

export const getContactById = (
  api: ChatbotXAPI,
  id: string,
): Promise<Contact> => {
  return api.request(`${CONTACTS_PREFIX}/${id}`, { method: "GET" })
}

export const listContactsByCustomField = (
  api: ChatbotXAPI,
  customFieldId: string,
  customFieldValue: string,
): Promise<{ data: Contact[] }> => {
  return api.request(
    `${CONTACTS_PREFIX}/find-by-custom-field?customFieldId=${customFieldId}&value=${customFieldValue}`,
    { method: "GET" },
  )
}

export const listTagsByContactId = (
  api: ChatbotXAPI,
  contactId: string,
): Promise<{ data: Tag[] }> => {
  return api.request(`${CONTACTS_PREFIX}/${contactId}/tags`, { method: "GET" })
}

export const addTagToContact = (
  api: ChatbotXAPI,
  contactId: string,
  tagId: string,
): Promise<unknown> => {
  return api.request(`${CONTACTS_PREFIX}/${contactId}/tags/${tagId}`, {
    method: "POST",
    body: JSON.stringify({}),
  })
}

export const deleteTagFromContact = (
  api: ChatbotXAPI,
  contactId: string,
  tagId: string,
): Promise<unknown> => {
  return api.request(`${CONTACTS_PREFIX}/${contactId}/tags/${tagId}`, {
    method: "DELETE",
    body: JSON.stringify({}),
  })
}

export const listCustomFieldsByContactId = (
  api: ChatbotXAPI,
  contactId: string,
): Promise<{ data: ContactCustomField[] }> => {
  return api.request(`${CONTACTS_PREFIX}/${contactId}/custom-fields`, {
    method: "GET",
  })
}

export const getContactCustomFieldValue = (
  api: ChatbotXAPI,
  contactId: string,
  customFieldId: string,
): Promise<ContactCustomField> => {
  return api.request(
    `${CONTACTS_PREFIX}/${contactId}/custom-fields/${customFieldId}`,
    { method: "GET" },
  )
}

export const updateContactCustomFieldValue = (
  api: ChatbotXAPI,
  contactId: string,
  customFieldId: string,
  value: string,
): Promise<unknown> => {
  return api.request(
    `${CONTACTS_PREFIX}/${contactId}/custom-fields/${customFieldId}`,
    {
      method: "POST",
      body: JSON.stringify({ value }),
    },
  )
}

export const deleteContactCustomField = (
  api: ChatbotXAPI,
  contactId: string,
  customFieldId: string,
): Promise<unknown> => {
  return api.request(
    `${CONTACTS_PREFIX}/${contactId}/custom-fields/${customFieldId}`,
    {
      method: "DELETE",
      body: JSON.stringify({}),
    },
  )
}

export const sendMessageToContact = (
  api: ChatbotXAPI,
  contactId: string,
  params: {
    channel: string
    content: string
    files?: string[]
    flowId?: string
    clientId?: string
  },
): Promise<unknown> => {
  return api.request(`${CONTACTS_PREFIX}/${contactId}/messages`, {
    method: "POST",
    body: JSON.stringify(params),
  })
}

export const createContact = (
  api: ChatbotXAPI,
  params: {
    phoneNumber: string
    email: string
    gender: "male" | "female" | "unknown"
    firstName?: string
    lastName?: string
  },
): Promise<Contact> => {
  return api.request(CONTACTS_PREFIX, {
    method: "POST",
    body: JSON.stringify(params),
  })
}
