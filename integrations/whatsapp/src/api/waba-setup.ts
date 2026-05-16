import ky, { HTTPError } from "ky"
import type { WhatsappAuthValue } from ".."
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue, WhatsappException } from "../exception"
import { logger } from "../lib/logger"

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
      if (error instanceof HTTPError) {
        const response = error.data
        if (
          response.error?.code === -1 &&
          response.error?.error_subcode === 1_752_244
        ) {
          logger.info(
            "Credit line sharing skipped: same business owns both WABA and credit line",
          )
          return
        }

        if (
          response.error?.code === -1 &&
          response.error?.error_subcode === 1_752_294
        ) {
          logger.warn(
            "Credit line sharing not allowed: violates Facebook invoicing policy",
          )
          return
        }
      }
      throw error
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

export function registerPhoneNumber({ auth }: { auth: WhatsappAuthValue }) {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
    const phoneNumbers = await getPhoneNumbers(auth)

    for (const phoneNumber of phoneNumbers) {
      if (phoneNumber.code_verification_status !== "VERIFIED") {
        continue
      }

      const pin = generatePin(phoneNumber.id, auth.metadata.wabaId)
      await api.post(`${API_URL}/${version}/${phoneNumber.id}/register`, {
        json: {
          messaging_product: "whatsapp",
          pin,
        },
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
      })
    }
  })
}

function getPhoneNumbers(auth: WhatsappAuthValue) {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
    const response = await api
      .get(`${API_URL}/${version}/${auth.metadata.wabaId}/phone_numbers`, {
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
      })
      .json<{
        data: Array<{
          id: string
          code_verification_status: string
        }>
      }>()

    return response.data
  })
}

function generatePin(phoneNumberId: string, wabaId: string): string {
  const sum = BigInt(phoneNumberId) + BigInt(wabaId)
  const pin = sum.toString().slice(-6)
  return pin
}
