import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { fetchAllWhatsappPages } from "../lib/pagination"
import {
  EMPTY_PAGINATION,
  type MessageTemplateEntity,
  type WhatsappAuthValue,
  type WhatsappPagination,
} from "../schema"

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
  accessToken: string
  fields?: string
  version?: string
}) {
  const { version = DEFAULT_API_VERSION } = props
  const fields = props.fields || "name,owner_business_info"

  return rescue(() =>
    ky
      .get<WhatsappWabaDetailResponse>(
        `${API_URL}/${version}/${props.wabaId}?fields=${fields}`,
        {
          headers: {
            Authorization: `Bearer ${props.accessToken}`,
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

  return rescue(async () => {
    const data = await fetchAllWhatsappPages<WhatsappFlow>({
      firstUrl: `${API_URL}/${version}/${auth.metadata.wabaId}/flows`,
      accessToken: auth.tokens.accessToken,
      resource: "flows",
    })

    return { data, paging: EMPTY_PAGINATION }
  })
}

export type ListMessageTemplatesReponse = {
  data: MessageTemplateEntity[]
  paging: {
    next: string
  }
}

export type CreateMessageTemplateProps = {
  name: string
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY"
  language: string
  // biome-ignore lint/suspicious/noExplicitAny: wip
  components: any[]
}

/**
 * Meta allows 250 message templates per WABA, rising to 6,000 once the business
 * portfolio is verified, so 60 pages of 100 already hold the largest account it
 * will ever hand us. The spare pages absorb a trailing `paging.next` on a full
 * final page, which keeps the bound a guard against a runaway walk rather than
 * a limit a real customer can hit.
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/
 */
const MESSAGE_TEMPLATE_MAX_PAGES = 70

export const listMessageTemplates = (
  auth: WhatsappAuthValue,
): Promise<ListMessageTemplatesReponse> => {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
    const data = await fetchAllWhatsappPages<MessageTemplateEntity>({
      firstUrl: `${API_URL}/${version}/${auth.metadata.wabaId}/message_templates`,
      accessToken: auth.tokens.accessToken,
      resource: "message_templates",
      maxPages: MESSAGE_TEMPLATE_MAX_PAGES,
    })

    return { data, paging: { next: "" } }
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
