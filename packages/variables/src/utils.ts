import {
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import type { ContactModel } from "@chatbotx.io/database/types"

export const extractVariables = (text: string): string[] => {
  const regex = /\{\{(\w+)\}\}/g
  return [...new Set(Array.from(text.matchAll(regex), (match) => match[1]))]
}

export const interpolate = (
  text: string,
  mapping: Record<string, string>,
): string => {
  return text.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
    return mapping[variable] ?? match
  })
}

export const getSystemFieldValue = async (
  contact: ContactModel,
  key: SystemFieldType,
): Promise<string | null> => {
  switch (key) {
    case systemFieldTypes.enum.email:
      return contact.email
    case systemFieldTypes.enum.phone_number:
      return contact.phoneNumber
    case systemFieldTypes.enum.first_name:
      return contact.firstName
    case systemFieldTypes.enum.last_name:
      return contact.lastName
    case systemFieldTypes.enum.full_name:
      return [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    default: {
      return await null
    }
  }
}
