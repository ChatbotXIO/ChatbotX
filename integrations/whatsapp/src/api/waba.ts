import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { WhatsappException } from "../exception"
import { logger } from "../lib/logger"
import type { WhatsappAuthValue, WhatsappPagination } from "../schemas"
import type { WhatsappPhoneNumberResponse } from "./phone-number"

export type WhatsappWabaDetailResponse = {
  id: string
  name: string
  owner_business_info: {
    id: string
    name: string
  }
  phone_numbers: WhatsappPhoneNumberResponse
}

export async function findWaba(props: {
  wabaId: string
  acessToken: string
  version?: string
}) {
  const { version = DEFAULT_API_VERSION } = props

  try {
    return await ky
      .get<WhatsappWabaDetailResponse>(
        `${API_URL}/${version}/${props.wabaId}?fields=name,owner_business_info,phone_numbers`,
        {
          headers: {
            Authorization: `Bearer ${props.acessToken}`,
          },
        },
      )
      .json()
  } catch (error) {
    logger.error(error, "Unable to find WhatsApp's business account")

    throw new WhatsappException("Unable to find WhatsApp's business account")
  }
}

export type WhatsappFlow = {
  id: string
  name: string
  status: string
  categories: string[]
  validation_errors: unknown[]
}

export type ListFlowsResponse = {
  data: WhatsappFlow[]
  paging: WhatsappPagination
}
export async function listFlows({
  auth,
}: {
  auth: WhatsappAuthValue
}): Promise<ListFlowsResponse> {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    return await ky
      .get<ListFlowsResponse>(
        `${API_URL}/${version}/${auth.metadata.wabaId}/flows`,
        {
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
          },
        },
      )
      .json()
  } catch (e) {
    logger.error(e, "Failed to list flows")
    throw new WhatsappException("Failed to list flows")
  }
}

export type ListMessageTemplatesReponse = {
  data: MessageTemplateEntity[]
  paging: {
    next: string
  }
}

export type MessageTemplateEntity = {
  id: string
  name: string
  status: "APPROVED" | "PENDING" | "REJECTED"
  language: string
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY"
}

export type CreateMessageTemplateProps = {
  name: string
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY"
  language: string
  // biome-ignore lint/suspicious/noExplicitAny: wip
  components: any[]
}

export const listMessageTemplates = async (
  auth: WhatsappAuthValue,
): Promise<ListMessageTemplatesReponse> => {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    return await ky
      .get<ListMessageTemplatesReponse>(
        `${API_URL}/${version}/${auth.metadata.wabaId}/message_templates`,
        {
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
          },
        },
      )
      .json()
  } catch (e) {
    logger.error(e, "Failed to list message templates")
    throw new WhatsappException("Failed to list message templates")
  }
}

export const createMessageTemplate = async (
  auth: WhatsappAuthValue,
  data: CreateMessageTemplateProps,
): Promise<MessageTemplateEntity> => {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    return await ky
      .post(`${API_URL}/${version}/${auth.metadata.wabaId}/message_templates`, {
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
        body: JSON.stringify(data),
      })
      .json()
  } catch (e) {
    logger.error(e, "Failed to create message template")
    throw new WhatsappException("Failed to create message template")
  }
}
