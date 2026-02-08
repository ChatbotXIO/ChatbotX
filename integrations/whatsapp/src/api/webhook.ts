import ky, { HTTPError } from "ky"
import type { WhatsappAuthValue } from ".."
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { WhatsappException } from "../exception"
import { logger } from "../lib/logger"

export async function subscribeWebhook({ auth }: { auth: WhatsappAuthValue }) {
  const { version = DEFAULT_API_VERSION } = auth

  try {
    const result = await ky
      .post<{
        success: boolean
      }>(`${API_URL}/${version}/${auth.metadata.wabaId}/subscribed_apps`, {
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
      })
      .json()

    if (!result.success) {
      throw new WhatsappException("Failed to subscribe webhook")
    }
  } catch (error) {
    if (error instanceof HTTPError) {
      const result = await error.response.json()
      if (result.error === "invalid_request") {
        logger.error(error, "Failed to subscribe webhook")
      }
    } else {
      logger.error(error, "Failed to subscribe webhook")
    }

    throw new WhatsappException("Failed to subscribe webhook")
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
    logger.error(error, "Failed to unsubscribe webhook")

    throw new WhatsappException("Failed to unsubscribe webhook")
  }
}
