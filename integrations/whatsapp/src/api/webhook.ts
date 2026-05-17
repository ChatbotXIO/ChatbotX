import ky, { HTTPError } from "ky"
import type { WhatsappAuthValue } from ".."
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue, WhatsappException } from "../exception"
import { logger } from "../lib/logger"

export function subscribeWebhook({
  auth,
  overrideCallbackUrl = false,
}: {
  auth: WhatsappAuthValue
  overrideCallbackUrl?: boolean
}) {
  const { version = DEFAULT_API_VERSION } = auth
  const url = `${API_URL}/${version}/${auth.metadata.wabaId}/subscribed_apps`

  return rescue(async () => {
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

    try {
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
          logger.error(error, "Subscribe webhook: invalid_request")
        }
      }
      throw error
    }
  })
}

export function unsubscribeWebhook({ auth }: { auth: WhatsappAuthValue }) {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
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
  })
}
