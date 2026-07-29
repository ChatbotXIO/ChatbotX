import type { Context } from "@chatbotx.io/sdk"
import ky from "ky"
import { parsePhoneNumberFromString } from "libphonenumber-js"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { logger } from "../lib/logger"
import { fetchAllWhatsappPages } from "../lib/pagination"
import {
  EMPTY_PAGINATION,
  type WhatsappAuthValue,
  type WhatsappPagination,
} from "../schema"

const LEADING_PLUS_RE = /^\+/
const NON_DIGIT_RE = /\D/g

/**
 * Normalize a Meta-provided WhatsApp display phone number to canonical
 * digits-only form (E.164 without the leading "+").
 *
 * Meta returns `display_phone_number` in E.164-ish form (e.g. "+84 123 456 789"
 * or "+1 555-867-5309"), so we parse it with libphonenumber-js — correct for
 * every country, not just VN. If parsing fails (unexpected/local format) we
 * fall back to a plain digits-only strip so we never throw on connect.
 */
export const normalizeWhatsappDisplayPhoneNumber = (phone: string): string => {
  const parsed = parsePhoneNumberFromString(phone)
  if (parsed?.isValid()) {
    return parsed.number.replace(LEADING_PLUS_RE, "")
  }

  return phone.replace(NON_DIGIT_RE, "")
}

export type WhatsappPhoneNumber = {
  verified_name: string
  code_verification_status: string
  name_status?: string
  display_phone_number: string
  quality_rating: string
  platform_type: string
  throughput: Record<string, unknown>
  webhook_configuration: Record<string, unknown>
  id: string
}

export type WhatsappPhoneNumberResponse = {
  data: WhatsappPhoneNumber[]
  paging: WhatsappPagination
}

/**
 * Lists every phone number on a WABA.
 *
 * All pages are aggregated, so the returned cursors describe no remaining
 * page — they are kept only because callers type against
 * `WhatsappPhoneNumberResponse`.
 */
export function listPhoneNumbers(props: {
  wabaId: string
  accessToken: string
  version?: string
}): Promise<WhatsappPhoneNumberResponse> {
  const { version = DEFAULT_API_VERSION } = props

  return rescue(async () => {
    const data = await fetchAllWhatsappPages<WhatsappPhoneNumber>({
      firstUrl: `${API_URL}/${version}/${props.wabaId}/phone_numbers`,
      accessToken: props.accessToken,
      resource: "phone_numbers",
    })

    return { data, paging: EMPTY_PAGINATION }
  })
}

export function findPhoneNumber(props: {
  wabaId: string
  accessToken: string
  version?: string
  phoneNumberId: string
}): Promise<WhatsappPhoneNumber> {
  const { version = DEFAULT_API_VERSION } = props

  return rescue(() =>
    ky
      .get<WhatsappPhoneNumber>(
        `${API_URL}/${version}/${props.wabaId}/phone_numbers/${props.phoneNumberId}`,
        {
          headers: {
            Authorization: `Bearer ${props.accessToken}`,
          },
        },
      )
      .json(),
  )
}

export type WhatsappPhoneNumberWebhookConfiguration = {
  application?: string
  waba_application?: string
  smb_app_data?: Record<string, unknown>
}

export type WhatsappPhoneNumberThroughput = {
  level?: string
}

export type WhatsappEntityCanSendMessage = "AVAILABLE" | "LIMITED" | "BLOCKED"

export type WhatsappEntityType =
  | "PHONE_NUMBER"
  | "WABA"
  | "BUSINESS"
  | "MESSAGE_TEMPLATE"
  | "APP"

export type WhatsappHealthError = {
  error_code?: number
  error_description?: string
  possible_solution?: string
}

export type WhatsappHealthEntity = {
  entity_type: WhatsappEntityType
  id?: string
  can_send_message?: WhatsappEntityCanSendMessage
  additional_info?: string[]
  errors?: WhatsappHealthError[]
}

export type WhatsappHealthStatus = {
  can_send_message?: WhatsappEntityCanSendMessage
  entities?: WhatsappHealthEntity[]
}

export type WhatsappPhoneNumberDetail = {
  id: string
  quality_rating?: string
  messaging_limit_tier?: string
  code_verification_status?: string
  account_mode?: string
  display_phone_number?: string
  name_status?: string
  verified_name?: string
  webhook_configuration?: WhatsappPhoneNumberWebhookConfiguration
  throughput?: WhatsappPhoneNumberThroughput
  last_onboarded_time?: string
  platform_type?: string
  certificate?: string
  health_status?: WhatsappHealthStatus
}

const PHONE_NUMBER_DETAIL_FIELDS = [
  "id",
  "quality_rating",
  "messaging_limit_tier",
  "code_verification_status",
  "account_mode",
  "display_phone_number",
  "name_status",
  "verified_name",
  "webhook_configuration",
  "throughput",
  "last_onboarded_time",
  "platform_type",
  "certificate",
  "health_status",
].join(",")

/**
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/phone-numbers
 */
export function findPhoneNumberDetail(
  auth: WhatsappAuthValue,
): Promise<WhatsappPhoneNumberDetail> {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(() =>
    ky
      .get<WhatsappPhoneNumberDetail>(
        `${API_URL}/${version}/${auth.metadata.phoneNumber.id}`,
        {
          searchParams: {
            fields: PHONE_NUMBER_DETAIL_FIELDS,
          },
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
          },
        },
      )
      .json(),
  )
}

export type CoexistEligibility = {
  isOnBizApp: boolean
  platformType: string
}

/**
 * Checks whether a phone number is eligible for Coexistence sync, i.e. it has
 * been onboarded onto Cloud API via the WhatsApp Business app embedded signup
 * flow. Returns Meta's truth, not the user's signup intent.
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/embedded-signup/onboard-whatsapp-business-app-users/
 */
export function getCoexistEligibility(props: {
  phoneNumberId: string
  accessToken: string
  version?: string
}): Promise<CoexistEligibility> {
  const { version = DEFAULT_API_VERSION, phoneNumberId, accessToken } = props

  return rescue(async () => {
    const result = await ky
      .get<{ is_on_biz_app?: boolean; platform_type?: string }>(
        `${API_URL}/${version}/${phoneNumberId}`,
        {
          searchParams: { fields: "is_on_biz_app,platform_type" },
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      )
      .json()

    return {
      isOnBizApp: result.is_on_biz_app === true,
      platformType: result.platform_type ?? "",
    }
  })
}

export type ConversationalAutomation = {
  enable_welcome_message: boolean
  prompts: string[]
  commands: {
    command_name: string
    command_description: string
  }[]
}

export type ConversationalAutomationResponse = {
  conversational_automation: ConversationalAutomation
  id: string
}

/**
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers/conversational-components/#configuring-via-the-api
 */
export const findConversationalAutomation = (
  auth: WhatsappAuthValue,
): Promise<ConversationalAutomation> => {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
    const result = await ky
      .get<ConversationalAutomationResponse>(
        `${API_URL}/${version}/${auth.metadata.phoneNumber.id}?fields=conversational_automation`,
        {
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
          },
        },
      )
      .json()

    return {
      enable_welcome_message:
        result.conversational_automation?.enable_welcome_message ?? false,
      prompts: result.conversational_automation?.prompts ?? [],
      commands: result.conversational_automation?.commands ?? [],
    }
  })
}

type WhatsappBusinessProfile = {
  profile_picture_url?: string
}

type WhatsappBusinessProfileResponse = {
  data: WhatsappBusinessProfile[]
}

/**
 * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/business-profiles
 */
export async function getBusinessProfilePictureUrl(props: {
  ctx: Context<WhatsappAuthValue>
}): Promise<string | undefined> {
  const { ctx } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const phoneNumberId = ctx.auth.metadata.phoneNumber.id
  const accessToken = ctx.auth.tokens.accessToken

  try {
    const response = await ky
      .get<WhatsappBusinessProfileResponse>(
        `${API_URL}/${version}/${phoneNumberId}/whatsapp_business_profile`,
        {
          searchParams: {
            fields: "profile_picture_url",
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )
      .json()

    return response.data?.[0]?.profile_picture_url
  } catch (err) {
    logger.error({ err }, "Failed to fetch WhatsApp business profile picture")
    return
  }
}

export function updateConversationalAutomation(
  auth: WhatsappAuthValue,
  data: ConversationalAutomation,
): Promise<void> {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
    await ky.post(
      `${API_URL}/${version}/${auth.metadata.phoneNumber?.id}/conversational_automation`,
      {
        json: data,
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
      },
    )
  })
}
