import {
  ChannelError,
  ChannelErrorCategory,
  UNKNOWN_ERROR,
} from "@chatbotx.io/sdk"
import ky from "ky"
import type { WhatsappAuthValue } from ".."
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue, WhatsappException } from "../exception"
import { mapToChannelError } from "../lib/error-mapper"
import { logger } from "../lib/logger"
import { listPhoneNumbers } from "./phone-number"

const api = ky.create({
  timeout: 60_000,
})

interface WhatsappSettings {
  businessId?: string
  businessName: string
  systemUserId: string
  systemUserToken: string
}

export function addSystemUser({
  auth,
  whatsappSettings,
}: {
  auth: WhatsappAuthValue
  whatsappSettings: WhatsappSettings
}) {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
    await api.post(
      `${API_URL}/${version}/${auth.metadata.wabaId}/assigned_users`,
      {
        searchParams: {
          user: whatsappSettings.systemUserId,
          tasks: "MANAGE",
        },
        headers: {
          Authorization: `Bearer ${whatsappSettings.systemUserToken}`,
        },
      },
    )
  })
}

export function shareCreditLine({
  auth,
  whatsappSettings,
}: {
  auth: WhatsappAuthValue
  whatsappSettings: WhatsappSettings
}) {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
    const creditLineId = await retrieveCreditLineId(whatsappSettings)

    try {
      await api.post(
        `${API_URL}/${version}/${creditLineId}/whatsapp_credit_sharing_and_attach`,
        {
          searchParams: {
            waba_id: auth.metadata.wabaId,
            waba_currency: "USD",
          },
          headers: {
            Authorization: `Bearer ${whatsappSettings.systemUserToken}`,
          },
        },
      )
    } catch (error) {
      logger.info({ error }, "Failed to share credit line")
    }
  })
}

function retrieveCreditLineId(
  whatsappSettings: WhatsappSettings,
): Promise<string> {
  return rescue(async () => {
    const response = await api
      .get(
        `${API_URL}/${DEFAULT_API_VERSION}/${whatsappSettings.businessId}/extendedcredits`,
        {
          searchParams: {
            fields: "id,legal_entity_name",
          },
          headers: {
            Authorization: `Bearer ${whatsappSettings.systemUserToken}`,
          },
        },
      )
      .json<{ data: Array<{ id: string; legal_entity_name: string }> }>()

    const creditLine = response.data.find((line) =>
      line.legal_entity_name.includes(whatsappSettings.businessName),
    )

    if (!creditLine) {
      throw new WhatsappException("You need to set up a line of credit")
    }

    return creditLine.id
  })
}

export type RegisterPhoneNumberResult =
  | { status: "registered" }
  | { status: "verification_required"; error: ChannelError }
  | { status: "failed"; error: ChannelError }

const PHONE_VERIFICATION_REQUIRED_CODE = 133_006
const PHONE_NOT_VERIFIED_SUBCODE = 2_593_005

const isVerificationRequiredError = (error: ChannelError): boolean =>
  Number(error.code) === PHONE_VERIFICATION_REQUIRED_CODE ||
  Number(error.subCode) === PHONE_NOT_VERIFIED_SUBCODE

const createPhoneNumberNotFoundError = (phoneNumberId: string) => {
  const error = new ChannelError(
    "WhatsApp phone number was not found in the selected WhatsApp Business Account.",
    ChannelErrorCategory.PERMISSION_DENIED,
    {
      code: UNKNOWN_ERROR.code,
      httpStatusCode: 404,
      subCode: null,
      type: "PhoneNumberNotFound",
    },
  )
  error.setOriginError({ phoneNumberId })
  return error
}

const createVerificationRequiredError = (phoneNumberId: string) => {
  const error = new ChannelError(
    "WhatsApp phone number verification is required before registration.",
    ChannelErrorCategory.PERMISSION_DENIED,
    {
      code: PHONE_VERIFICATION_REQUIRED_CODE,
      httpStatusCode: 403,
      subCode: null,
      type: "PhoneVerificationRequired",
    },
  )
  error.setOriginError({ phoneNumberId })
  return error
}

export function registerPhoneNumber({
  auth,
  phoneNumberId,
}: {
  auth: WhatsappAuthValue
  phoneNumberId: string
}): Promise<RegisterPhoneNumberResult> {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
    const phoneNumbers = await listPhoneNumbers({
      wabaId: auth.metadata.wabaId,
      accessToken: auth.tokens.accessToken,
      version,
    })
    const phoneNumber = phoneNumbers.data.find(
      (candidate) => candidate.id === phoneNumberId,
    )

    if (!phoneNumber) {
      return {
        status: "failed",
        error: createPhoneNumberNotFoundError(phoneNumberId),
      }
    }

    if (phoneNumber.code_verification_status !== "VERIFIED") {
      return {
        status: "verification_required",
        error: createVerificationRequiredError(phoneNumberId),
      }
    }

    try {
      const registrationPin = generatePin(phoneNumber.id, auth.metadata.wabaId)

      await api.post(`${API_URL}/${version}/${phoneNumber.id}/register`, {
        json: {
          messaging_product: "whatsapp",
          pin: registrationPin,
        },
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
      })
      return { status: "registered" }
    } catch (error) {
      const channelError = mapToChannelError(error)
      if (isVerificationRequiredError(channelError)) {
        return { status: "verification_required", error: channelError }
      }

      return { status: "failed", error: channelError }
    }
  })
}

function generatePin(phoneNumberId: string, wabaId: string): string {
  const sum = BigInt(phoneNumberId) + BigInt(wabaId)
  const pin = sum.toString().slice(-6)
  return pin
}
