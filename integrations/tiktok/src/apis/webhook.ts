import ky from "ky"
import { BUSINESS_API_BASE_URL } from "../constants"
import { rescue, TiktokAPIException } from "../exception"

type WebhookUpdateResponse = {
  code: number
  message?: string
}

/**
 * Registers the callback URL for one TikTok event type.
 *
 * TikTok scopes a subscription to a single `event_type`, so an app that wants
 * both DMs and comments calls this once per type with the same URL.
 *
 * TODO(tiktok-comments): the `event_type` value for `comment.update` is not in
 * the public docs — read it off the Webhooks page of the app in the TikTok
 * developer portal and subscribe to it alongside `DIRECT_MESSAGE`. Until then
 * comment events only arrive for apps whose subscription was configured by
 * hand in the portal. Deliberately not guessed: a wrong `event_type` is
 * rejected, and this call runs on the credential-save path, so a bad guess
 * would break saving TikTok settings at all.
 */
export const subscribeWebhook = (
  { clientId, clientSecret }: { clientId: string; clientSecret: string },
  callbackUrl: string,
  eventType = "DIRECT_MESSAGE",
): Promise<void> =>
  rescue("business/webhook/update", async () => {
    const response = await ky
      .post(`${BUSINESS_API_BASE_URL}business/webhook/update/`, {
        json: {
          app_id: clientId,
          secret: clientSecret,
          event_type: eventType,
          callback_url: callbackUrl,
        },
        headers: { "Content-Type": "application/json" },
      })
      .json<WebhookUpdateResponse>()

    if (response.code !== 0) {
      throw new TiktokAPIException(
        response.message ?? "Webhook subscription failed",
      )
    }
  })
