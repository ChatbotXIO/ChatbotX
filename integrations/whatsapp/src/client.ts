import { SdkException, type Context } from "@ahachat.ai/sdk"
import { WhatsAppAPI } from "whatsapp-api-js"
import { DEFAULT_API_VERSION } from "whatsapp-api-js/types"
import type { WhatsappAuthValue } from "./schemas"
import type { WhatsappPhoneNumber, WhatsappPhoneNumberResponse } from "./types"

export const getWhatsappClient = (auth: WhatsappAuthValue) => {
  return new WhatsAppAPI({
    token: auth.tokens.accessToken,
    appSecret: auth.clientSecret,
    v: DEFAULT_API_VERSION,
  })
}

/**
 * Verify token and get first phoneNumberId
 *
 * @param auth WhatsappAuthValue
 * @returns string phoneNumberId
 */
export const verifyAccessToken = async (
  ctx: Context<WhatsappAuthValue>,
): Promise<WhatsappPhoneNumber> => {
  const client = getWhatsappClient(ctx.auth)

  /**
   * Sample response
   * {
   *    data: [
   *      {
   *        verified_name: 'Test Number',
   *        code_verification_status: 'NOT_VERIFIED',
   *        display_phone_number: '15551437537',
   *        quality_rating: 'GREEN',
   *        platform_type: 'CLOUD_API',
   *        throughput: [Object],
   *        webhook_configuration: [Object],
   *        id: '513345888530969'
   *      }
   *    ]
   *  }
   */
  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${ctx.auth.metadata.wabaId}/phone_numbers`,
  )
  if (!res.ok) {
    throw new SdkException("Access token is not valid")
  }

  try {
    const body = (await res.json()) as WhatsappPhoneNumberResponse
    if (body.data[0].id) {
      return body.data[0]
    }

    throw new SdkException("Unable to get phone number")
  } catch (err: unknown) {
    throw new SdkException(`Unable to get phone number: ${err}`)
  }
}
