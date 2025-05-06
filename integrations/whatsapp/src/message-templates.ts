import { SdkException } from "@ahachat.ai/sdk"
import { DEFAULT_API_VERSION } from "whatsapp-api-js/types"
import { getWhatsappClient } from "./client"
import type { WhatsappAuthValue } from "./index"

export interface ListMessageTemplatesReponse {
  data: MessageTemplateEntity[]
  paging: {
    next: string
  }
}

export interface MessageTemplateEntity {
  id: string
  name: string
  status: "APPROVED" | "PENDING" | "REJECTED"
  language: string
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY"
}

export interface CreateMessageTemplateProps {
  name: string
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY"
  language: string
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  components: any[]
}

export const listMessageTemplates = async (
  auth: WhatsappAuthValue,
  params: { limit: number },
): Promise<ListMessageTemplatesReponse> => {
  const client = getWhatsappClient(auth)

  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.metadata.wabaId}/message_templates?limit=${params.limit}`,
  )
  if (!res.ok) {
    throw new SdkException(`Unable to list message templates: ${res.text()}`)
  }

  return await res.json()
}

export const createMessageTemplate = async (
  auth: WhatsappAuthValue,
  data: CreateMessageTemplateProps,
): Promise<MessageTemplateEntity> => {
  const client = getWhatsappClient(auth)

  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.metadata.wabaId}/message_templates`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    },
  )
  if (!res.ok) {
    throw new SdkException(`Unable to create message template: ${res.text()}`)
  }

  return await res.json()
}
