import ky, { HTTPError } from "ky"
import type { WhatsappAuthValue } from ".."
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue, WhatsappException } from "../exception"
import { logger } from "../lib/logger"

export const WHATSAPP_BASE_SUBSCRIBED_FIELDS = [
  "messages",
  "history",
  "smb_app_state_sync",
  "smb_message_echoes",
] as const

export const WHATSAPP_SUBSCRIBED_FIELDS = [
  ...WHATSAPP_BASE_SUBSCRIBED_FIELDS,
  "automatic_events",
] as const

export function subscribeWebhook({
  auth,
  includeAutomaticEvents = false,
  overrideCallbackUrl = false,
}: {
  auth: WhatsappAuthValue
  includeAutomaticEvents?: boolean
  overrideCallbackUrl?: boolean
}) {
  const { version = DEFAULT_API_VERSION } = auth
  const url = `${API_URL}/${version}/${auth.metadata.wabaId}/subscribed_apps`

  return rescue(async () => {
    const json: Record<string, unknown> = {
      subscribed_fields: includeAutomaticEvents
        ? WHATSAPP_SUBSCRIBED_FIELDS
        : WHATSAPP_BASE_SUBSCRIBED_FIELDS,
    }

    // Explicit per-integration callback (metadata.webhookUrl) wins; the env
    // var is only a global fallback when no explicit override is requested.
    if (overrideCallbackUrl && auth.metadata.webhookUrl && auth.verifyToken) {
      json.override_callback_uri = auth.metadata.webhookUrl
      json.verify_token = auth.verifyToken
    } else {
      const envOverrideUri = process.env.WHATSAPP_OVERRIDE_CALLBACK_URI
      if (envOverrideUri && auth.verifyToken) {
        json.override_callback_uri = envOverrideUri
        json.verify_token = auth.verifyToken
      }
    }

    try {
      const result = await ky
        .post<{
          success: boolean
        }>(url, {
          headers: {
            Authorization: `Bearer ${auth.tokens.accessToken}`,
          },
          json,
        })
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
