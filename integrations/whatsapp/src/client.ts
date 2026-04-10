import { type Context, SdkException } from "@chatbotx.io/sdk"
import { WhatsAppAPI } from "whatsapp-api-js"
import type {
  WhatsappPhoneNumber,
  WhatsappPhoneNumberResponse,
} from "./api/phone-number"
import { API_URL, DEFAULT_API_VERSION } from "./constants"
import type { WhatsappAuthValue } from "./schema"

export const getWhatsappClient = (auth: WhatsappAuthValue) =>
  new WhatsAppAPI({
    token: auth.tokens.accessToken,
    appSecret: auth.clientSecret,
    v: DEFAULT_API_VERSION,
  })

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
    `${API_URL}/${DEFAULT_API_VERSION}/${ctx.auth.metadata.wabaId}/phone_numbers`,
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

/**
 * Start an upload file
 * @see https://developers.facebook.com/docs/graph-api/guides/upload#step-1
 * @see https://developers.facebook.com/docs/graph-api/guides/upload#step-2
 *
 * @param auth WhatsappAuthValue
 * @param file File
 * @returns string uploadedFileId
 */
export const uploadMedia = async (
  auth: WhatsappAuthValue,
  file: File,
): Promise<string> => {
  const client = getWhatsappClient(auth)
  const resSession = await client.$$apiFetch$$(
    `${API_URL}/${DEFAULT_API_VERSION}/${auth.clientId}/uploads`,
    {
      method: "POST",
      body: new URLSearchParams({
        file_name: file.name,
        file_type: file.type,
        access_token: auth.tokens.accessToken,
      }),
    },
  )
  if (!resSession.ok) {
    throw new SdkException("File is not valid")
  }

  const { id: sessionId } = await resSession.json()
  if (!sessionId) {
    throw new SdkException("Upload session is not created")
  }

  const res = await client.$$apiFetch$$(
    `${API_URL}/${DEFAULT_API_VERSION}/${sessionId}`,
    {
      method: "POST",
      headers: {
        Authorization: `OAuth ${auth.tokens.accessToken}`,
        file_offset: "0",
      },
      body: file,
    },
  )
  if (!res.ok) {
    throw new SdkException("Access token is not valid")
  }

  const { h: uploadedFileId } = await res.json()
  if (!uploadedFileId) {
    throw new SdkException("Upload file can't upload")
  }

  return uploadedFileId
}
