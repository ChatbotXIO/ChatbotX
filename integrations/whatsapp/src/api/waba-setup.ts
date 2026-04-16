import ky, { HTTPError } from "ky"
import type { WhatsappAuthValue } from ".."
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { WhatsappException } from "../exception"

const api = ky.create({
  timeout: 60_000,
})

interface WhatsappSettings {
  businessId?: string
  businessName: string
  systemUserId: string
  systemUserToken: string
}

export async function addSystemUser({
  auth,
  whatsappSettings,
}: {
  auth: WhatsappAuthValue
  whatsappSettings: WhatsappSettings
}) {
  const { version = DEFAULT_API_VERSION } = auth

  try {
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
  } catch (error) {
    console.error("Failed to add system user", error)
    throw new WhatsappException("Failed to add system user").setOriginError(
      error,
    )
  }
}

export async function shareCreditLine({
  auth,
  whatsappSettings,
}: {
  auth: WhatsappAuthValue
  whatsappSettings: WhatsappSettings
}) {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    const creditLineId = await retrieveCreditLineId(whatsappSettings)

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
      const response = await error.response.json()
      if (
        response.error?.code === -1 &&
        response.error?.error_subcode === 1_752_244
      ) {
        console.info(
          "Credit line sharing skipped: same business owns both WABA and credit line",
        )
        return
      }

      if (
        response.error?.code === -1 &&
        response.error?.error_subcode === 1_752_294
      ) {
        console.warn(
          "Credit line sharing not allowed: violates Facebook invoicing policy",
        )
        return
      }
    }
    console.error("Failed to share credit line", error)
    throw new WhatsappException("Failed to share credit line").setOriginError(
      error,
    )
  }
}

async function retrieveCreditLineId(
  whatsappSettings: WhatsappSettings,
): Promise<string> {
  try {
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
  } catch (error) {
    console.error("Failed to retrieve credit line ID", error)
    throw new WhatsappException(
      "Failed to retrieve credit line ID",
    ).setOriginError(error)
  }
}

export async function registerPhoneNumber({
  auth,
}: {
  auth: WhatsappAuthValue
}) {
  const { version = DEFAULT_API_VERSION } = auth

  try {
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
  } catch (error) {
    console.error("Failed to register phone number", error)
    throw new WhatsappException(
      "Failed to register phone number",
    ).setOriginError(error)
  }
}

async function getPhoneNumbers(auth: WhatsappAuthValue) {
  const { version = DEFAULT_API_VERSION } = auth

  try {
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
  } catch (error) {
    console.error("Failed to get phone numbers", error)
    throw new WhatsappException("Failed to get phone numbers").setOriginError(
      error,
    )
  }
}

function generatePin(phoneNumberId: string, wabaId: string): string {
  const sum = BigInt(phoneNumberId) + BigInt(wabaId)
  const pin = sum.toString().slice(-6)
  return pin
}
