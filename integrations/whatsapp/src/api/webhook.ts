import ky, { HTTPError } from "ky"
import type { WhatsappAuthValue } from ".."
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { WhatsappException } from "../exception"

export async function subscribeWebhook({
  auth,
  overrideCallbackUrl = false,
}: {
  auth: WhatsappAuthValue
  overrideCallbackUrl?: boolean
}) {
  const { version = DEFAULT_API_VERSION } = auth
  const url = `${API_URL}/${version}/${auth.metadata.wabaId}/subscribed_apps`

  try {
    const requestOptions: Parameters<typeof ky.post>[1] = {
      headers: {
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
    }

    if (overrideCallbackUrl && auth.metadata.webhookUrl && auth.verifyToken) {
      requestOptions.json = {
        override_callback_uri: auth.metadata.webhookUrl,
        verify_token: auth.verifyToken,
      }
    }

    const result = await ky
      .post<{
        success: boolean
      }>(url, requestOptions)
      .json()

    if (!result.success) {
      throw new WhatsappException("Failed to subscribe webhook")
    }
  } catch (error) {
    if (error instanceof HTTPError) {
      const result = error.data
      if (result.error === "invalid_request") {
        console.error("Failed to subscribe webhook", error)
      }
    } else {
      console.error("Failed to subscribe webhook", error)
    }

    throw new WhatsappException("Failed to subscribe webhook").setOriginError(
      error,
    )
  }
}

export async function unsubscribeWebhook({
  auth,
}: {
  auth: WhatsappAuthValue
}) {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    const result = await ky
      .delete<{
        success: boolean
      }>(`${API_URL}/${version}/${auth.metadata.wabaId}/subscribed_apps`, {
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
      })
      .json()

    if (!result.success) {
      throw new WhatsappException("Failed to unsubscribe webhook")
    }
  } catch (error) {
    console.error("Failed to unsubscribe webhook", error)

    throw new WhatsappException("Failed to unsubscribe webhook").setOriginError(
      error,
    )
  }
}
