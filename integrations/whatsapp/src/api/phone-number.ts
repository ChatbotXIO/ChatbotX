import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { WhatsappException } from "../exception"
import type { WhatsappAuthValue, WhatsappPagination } from "../schema"

export const normalizeWhatsappDisplayPhoneNumber = (
  phone: string,
  defaultCountryCode = "84",
): string => {
  let digits = phone.replace(/\D/g, "")

  if (digits.startsWith("0")) {
    // convert local VN number starting with 0
    digits = defaultCountryCode + digits.slice(1)
  }

  return digits
}

export type WhatsappPhoneNumber = {
  verified_name: string
  code_verification_status: string
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

export async function listPhoneNumbers(props: {
  wabaId: string
  accessToken: string
  version?: string
}): Promise<WhatsappPhoneNumberResponse> {
  const { version = DEFAULT_API_VERSION } = props

  try {
    return await ky
      .get<WhatsappPhoneNumberResponse>(
        `${API_URL}/${version}/${props.wabaId}/phone_numbers`,
        {
          headers: {
            Authorization: `Bearer ${props.accessToken}`,
          },
        },
      )
      .json()
  } catch (error) {
    console.error("Unable to list WhatsApp's phone numbers", error)

    throw new WhatsappException(
      "Unable to list WhatsApp's phone numbers",
    ).setOriginError(error)
  }
}

export async function findPhoneNumber(props: {
  wabaId: string
  accessToken: string
  version?: string
  phoneNumberId: string
}): Promise<WhatsappPhoneNumber> {
  const { version = DEFAULT_API_VERSION } = props

  try {
    return await ky
      .get<WhatsappPhoneNumber>(
        `${API_URL}/${version}/${props.wabaId}/phone_numbers/${props.phoneNumberId}`,
        {
          headers: {
            Authorization: `Bearer ${props.accessToken}`,
          },
        },
      )
      .json()
  } catch (error) {
    console.error("Unable to find WhatsApp's phone number", error)

    throw new WhatsappException(
      "Unable to find WhatsApp's phone number",
    ).setOriginError(error)
  }
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
export async function findPhoneNumberDetail(
  auth: WhatsappAuthValue,
): Promise<WhatsappPhoneNumberDetail> {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    return await ky
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
      .json()
  } catch (error) {
    console.error("Unable to find WhatsApp's phone number detail", error)

    throw new WhatsappException(
      "Unable to find WhatsApp's phone number detail",
    ).setOriginError(error)
  }
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
export const findConversationalAutomation = async (
  auth: WhatsappAuthValue,
): Promise<ConversationalAutomation> => {
  const { version = DEFAULT_API_VERSION } = auth

  try {
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

    const conversationalAutomation = result.conversational_automation ?? {
      prompts: [],
      commands: [],
    }

    return conversationalAutomation
  } catch (e) {
    console.error("Failed to list conversational automation", e)
    throw new WhatsappException(
      "Failed to list conversational automation",
    ).setOriginError(e)
  }
}

export async function updateConversationalAutomation(
  auth: WhatsappAuthValue,
  data: ConversationalAutomation,
): Promise<void> {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    await ky.post(
      `${API_URL}/${version}/${auth.metadata.phoneNumber?.id}/conversational_automation`,
      {
        json: data,
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
      },
    )
  } catch (e) {
    console.error("Failed to update conversational automation", e)
    throw new WhatsappException(
      "Failed to update conversational automation",
    ).setOriginError(e)
  }
}
