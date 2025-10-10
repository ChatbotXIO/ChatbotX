import ky from "ky"
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
        json: {
          override_callback_uri: ["messages"],
          verify_token: auth.verifyToken ?? "ahachat",
        },
      })
      .json()

    if (!result.success) {
      throw new WhatsappException("Failed to subscribe webhook")
    }
  } catch (error) {
    logger.error("Failed to subscribe webhook", { error })

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
      .post<{
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
    logger.error("Failed to unsubscribe webhook", { error })

    throw new WhatsappException("Failed to unsubscribe webhook")
  }
}
