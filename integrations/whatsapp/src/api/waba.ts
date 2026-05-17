import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import type { WhatsappAuthValue, WhatsappPagination } from "../schema"
import type { WhatsappPhoneNumberResponse } from "./phone-number"

export type WhatsappWabaMMLite = {
  marketing_messages_onboarding_status?: WhatsappMarketingMessagesLiteApiStatus
}

export type WhatsappWabaDetailResponse = WhatsappWabaMMLite & {
  id: string
  name: string
  owner_business_info: {
    id: string
    name: string
  }
  phone_numbers: WhatsappPhoneNumberResponse
}

export type WhatsappMarketingMessagesLiteApiStatus =
  | "INELIGIBLE_ON_BEHALF_OF_WABA"
  | "INELIGIBLE_INACTIVE_OR_RESTRICTED"
  | "INELIGIBLE_COUNTRY_NOT_SUPPORTED"
  | "INELIGIBLE_USING_WHATSAPP_BUSINESS_APP"
  | "ELIGIBLE"
  | "PENDING_VALID_PAYMENT_METHOD"
  | "PENDING_INTERNAL_SETUP"
  | "ONBOARDED"

export function findWaba(props: {
  wabaId: string
  acessToken: string
  fields?: string
  version?: string
}) {
  const { version = DEFAULT_API_VERSION } = props
  const fields = props.fields || "name,owner_business_info,phone_numbers"

  return rescue(() =>
    ky
      .get<WhatsappWabaDetailResponse>(
        `${API_URL}/${version}/${props.wabaId}?fields=${fields}`,
        {
          headers: {
            Authorization: `Bearer ${props.acessToken}`,
          },
        },
      )
      .json(),
  )
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
export function listFlows({
  auth,
}: {
  auth: WhatsappAuthValue
}): Promise<ListFlowsResponse> {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(() =>
    ky
      .get<ListFlowsResponse>(
        `${API_URL}/${version}/${auth.metadata.wabaId}/flows`,
        {
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
          },
        },
      )
      .json(),
  )
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
  components: JSON[]
}

export type CreateMessageTemplateProps = {
  name: string
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY"
  language: string
  // biome-ignore lint/suspicious/noExplicitAny: wip
  components: any[]
}

export const listMessageTemplates = (
  auth: WhatsappAuthValue,
): Promise<ListMessageTemplatesReponse> => {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
    const allTemplates: MessageTemplateEntity[] = []
    let nextUrl: string | undefined =
      `${API_URL}/${version}/${auth.metadata.wabaId}/message_templates`

    while (nextUrl) {
      const response: ListMessageTemplatesReponse = await ky
        .get<ListMessageTemplatesReponse>(nextUrl, {
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
          },
        })
        .json()

      allTemplates.push(...response.data)
      nextUrl = response.paging?.next
    }

    return {
      data: allTemplates,
      paging: { next: "" },
    }
  })
}

export const createMessageTemplate = (
  auth: WhatsappAuthValue,
  data: CreateMessageTemplateProps,
): Promise<MessageTemplateEntity> => {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(() =>
    ky
      .post(`${API_URL}/${version}/${auth.metadata.wabaId}/message_templates`, {
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
        body: JSON.stringify(data),
      })
      .json(),
  )
}
