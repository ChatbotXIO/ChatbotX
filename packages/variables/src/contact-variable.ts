import { db } from "@chatbotx.io/database/client"
import {
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import { logger } from "./logger"
import type { ContactCustomFieldValue, ReplaceVariableProps } from "./schema"
import { extractVariables, getSystemFieldValue, interpolate } from "./utils"

export const contactVariableService = {
  getAll: async (contactId: string): Promise<ReplaceVariableProps> => {
    const contact = await db.query.contactModel.findFirst({
      where: { id: contactId },
    })
    if (!contact) {
      logger.error(`Contact ${contactId} not found`)
      throw new Error("Contact not found")
    }

    const fields: ContactCustomFieldValue[] =
      await db.query.contactCustomFieldModel
        .findMany({
          where: {
            contactId,
          },
          with: {
            customField: true,
          },
        })
        .then((data) => {
          return data.map((v) => ({
            key: v.customField.name,
            type: v.customField.type,
            value: v.value,
            description: v.customField.description ?? "",
          }))
        })

    const customFieldsMap = new Map(fields.map((field) => [field.key, field]))

    return { contact, customFieldsMap }
  },

  replaceAll: async (props: {
    text: string
    variables: ReplaceVariableProps
  }): Promise<string> => {
    const {
      variables: { contact, customFieldsMap },
      text,
    } = props

    try {
      const mapping: Record<string, string> = {}
      const variables = extractVariables(text)
      for (const variable of variables) {
        if (systemFieldTypes.options.includes(variable as SystemFieldType)) {
          const value = await getSystemFieldValue(
            contact,
            variable as SystemFieldType,
          )
          if (value) {
            mapping[variable] = value
          }
        } else if (customFieldsMap.has(variable)) {
          mapping[variable] = String(customFieldsMap.get(variable)?.value)
        }
      }

      return interpolate(text, mapping)
    } catch (error) {
      const message = "Unable to render custom fields to message"
      logger.error(error, message)

      throw new Error(message)
    }
  },
}
