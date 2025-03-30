import { SdkException } from "@ahachat.ai/sdk"
import { WhatsAppAPI } from "whatsapp-api-js"
import { DEFAULT_API_VERSION } from "whatsapp-api-js/types"
import type { WhatsappAuthValue } from "./schemas"

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
  auth: WhatsappAuthValue,
): Promise<string> => {
  const client = getWhatsappClient(auth)

  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.metadata.wabaId}/phone_numbers`,
  )
  if (!res.ok) {
    throw new SdkException("Access token is not valid")
  }

  const {
    data: [{ id: phoneNumberId }],
  } = await res.json()
  if (!phoneNumberId) {
    throw new SdkException("Phone number is not found")
  }

  return phoneNumberId
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
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.clientId}/uploads`,
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
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${sessionId}`,
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

/**
 * Get list of message templates.
 *
 * @param auth WhatsappAuthValue
 * @returns string phoneNumberId
 */
export const getTemplates = async (
  auth: WhatsappAuthValue,
  params: { limit: number },
): Promise<string> => {
  const client = getWhatsappClient(auth)

  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.metadata.wabaId}/message_templates?limit=${params.limit}`,
  )
  if (!res.ok) {
    throw new SdkException("Access token is not valid")
  }

  const { data } = await res.json()

  return data
}

/**
 * Create message templates.
 *
 * @param auth WhatsappAuthValue
 * @returns string phoneNumberId
 */
export const createTemplate = async (
  auth: WhatsappAuthValue,
  body,
): Promise<string> => {
  const client = getWhatsappClient(auth)

  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.metadata.wabaId}/message_templates`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) {
    console.log("res", await res.text())
    throw new SdkException("Access token is not valid")
  }

  return await res.json()
}

/**
 * Get list of flows.
 *
 * @param auth WhatsappAuthValue
 * @returns string phoneNumberId
 */
export const getFlows = async (
  auth: WhatsappAuthValue,
  params: { limit: number },
): Promise<string> => {
  const client = getWhatsappClient(auth)

  const res = await client.$$apiFetch$$(
    `https://graph.facebook.com/${DEFAULT_API_VERSION}/${auth.metadata.wabaId}/flows?limit=${params.limit}`,
  )
  if (!res.ok) {
    throw new SdkException("Access token is not valid")
  }

  const { data } = await res.json()

  return data
}
