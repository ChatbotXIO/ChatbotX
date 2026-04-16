import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { WhatsappException } from "../exception"
import type { WhatsappAuthValue, WhatsappPagination } from "../schema"

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

    return result.conversational_automation
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
