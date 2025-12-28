import { prisma } from "@aha.chat/database"
import {
  FieldType,
  type Gender,
  reservedCustomFieldNames,
  SenderType,
} from "@aha.chat/database/types"
import { AI_PROVIDERS } from "@aha.chat/flow-config"

export type CommonAIConfig = {
  provider: string
  model: string
  apiKey: string
  baseURL?: string
}

/**
 * Fetch AI Provider configuration from database
 */
export async function fetchAIProviderConfig(
  chatbotId: string,
  provider: string | undefined,
  model: string | undefined,
): Promise<CommonAIConfig | null> {
  if (!(provider && model)) {
    return null
  }

  switch (provider) {
    case "openai": {
      const integration = await prisma.integrationOpenAI.findFirst({
        where: { chatbotId },
      })

      if (!integration?.autoReply) {
        return null
      }

      const auth = integration.auth as { secretText?: string } | undefined
      const apiKey = auth?.secretText

      if (!apiKey?.trim()) {
        return null
      }

      return {
        provider: AI_PROVIDERS.OPENAI,
        model,
        apiKey,
      }
    }

    case "gemini": {
      const integration = await prisma.integrationGemini.findFirst({
        where: { chatbotId },
      })

      if (!integration?.autoReply) {
        return null
      }

      const auth = integration.auth as { secretText?: string } | undefined
      const apiKey = auth?.secretText

      if (!apiKey?.trim()) {
        return null
      }

      return {
        provider: AI_PROVIDERS.GEMINI,
        model,
        apiKey,
      }
    }

    default:
      return null
  }
}

/**
 * Replace custom field attributes in a string (e.g. {{first_name}})
 */
export async function replaceCustomFieldAttributes(
  message: string,
  conversationId: string,
): Promise<string> {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId },
      include: {
        contact: {
          include: {
            contactCustomFields: {
              include: {
                customField: true,
              },
            },
          },
        },
      },
    })

    if (!conversation?.contact) {
      return message
    }

    const fieldMap = new Map<string, string>()

    // Fetch last user message if requested
    if (message.includes("{{last_input}}")) {
      const lastUserMessage = await prisma.message.findFirst({
        where: {
          conversationId,
          senderType: SenderType.contact,
        },
        orderBy: { createdAt: "desc" },
      })
      if (lastUserMessage?.content) {
        fieldMap.set("last_input", lastUserMessage.content)
      }
    }

    // Standard fields
    if (conversation.contact.firstName) {
      fieldMap.set("first_name", conversation.contact.firstName)
    }
    if (conversation.contact.lastName) {
      fieldMap.set("last_name", conversation.contact.lastName)
    }
    if (conversation.contact.email) {
      fieldMap.set("email", conversation.contact.email)
    }
    if (conversation.contact.phoneNumber) {
      fieldMap.set("phone_number", conversation.contact.phoneNumber)
    }

    // Custom fields
    for (const customField of conversation.contact.contactCustomFields) {
      if (customField.customField?.name && customField.value) {
        fieldMap.set(customField.customField.name, customField.value)
      }
    }

    let processedMessage = message
    const attributeRegex = /\{\{([\w\s._-]+)\}\}/g

    processedMessage = processedMessage.replace(
      attributeRegex,
      (match, fieldName) => {
        const value = fieldMap.get(fieldName.trim())
        return value || match
      },
    )

    return processedMessage
  } catch {
    return message
  }
}

/**
 * Save result text to a custom field or reserved field
 */
export async function saveResultToCustomField({
  contactId,
  customFieldId,
  fullText,
  chatbotId,
  messageCount,
}: {
  contactId: string | null
  customFieldId: string
  fullText: string
  chatbotId: string
  messageCount?: number
}): Promise<void> {
  if (!(contactId && customFieldId.trim() && fullText)) {
    return
  }

  if (messageCount === 0) {
    return
  }

  const isReservedField = Object.values(reservedCustomFieldNames).includes(
    customFieldId as (typeof reservedCustomFieldNames)[keyof typeof reservedCustomFieldNames],
  )

  if (isReservedField) {
    const updateData: Partial<{
      firstName: string
      lastName: string
      email: string
      phoneNumber: string
      avatar: string
      gender: Gender
    }> = {}

    switch (customFieldId) {
      case reservedCustomFieldNames.first_name:
        updateData.firstName = fullText
        break
      case reservedCustomFieldNames.last_name:
        updateData.lastName = fullText
        break
      case reservedCustomFieldNames.full_name: {
        const trimmedName = fullText.trim()
        const spaceIndex = trimmedName.indexOf(" ")
        if (spaceIndex > 0) {
          updateData.firstName = trimmedName.substring(0, spaceIndex)
          updateData.lastName = trimmedName.substring(spaceIndex + 1).trim()
        } else if (trimmedName.length > 0) {
          updateData.firstName = trimmedName
        }
        break
      }
      case reservedCustomFieldNames.email:
        updateData.email = fullText
        break
      case reservedCustomFieldNames.phone_number:
        updateData.phoneNumber = fullText
        break
      case reservedCustomFieldNames.avatar:
        updateData.avatar = fullText
        break
      case reservedCustomFieldNames.gender:
        if (
          fullText === "male" ||
          fullText === "female" ||
          fullText === "unknown"
        ) {
          updateData.gender = fullText as Gender
        }
        break
      default:
        return
    }

    await prisma.contact.update({
      where: { id: contactId },
      data: updateData,
    })
    return
  }

  const customField = await prisma.field.findFirst({
    where: {
      id: customFieldId,
      fieldType: FieldType.customField,
      chatbotId,
    },
  })

  if (!customField) {
    return
  }

  await prisma.contactCustomField.upsert({
    where: {
      contactId_customFieldId: {
        contactId,
        customFieldId,
      },
    },
    update: {
      value: fullText,
    },
    create: {
      contactId,
      customFieldId,
      value: fullText,
    },
  })
}
