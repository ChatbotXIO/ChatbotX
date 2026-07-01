import ky from "ky"
import { BUSINESS_API_BASE_URL } from "../constants"
import { rescue, TiktokAPIException } from "../exception"

type WebhookUpdateResponse = {
  code: number
  message?: string
}

export const subscribeWebhook = (
  { clientId, clientSecret }: { clientId: string; clientSecret: string },
  callbackUrl: string,
): Promise<void> =>
  rescue("business/webhook/update", async () => {
    const response = await ky
      .post(`${BUSINESS_API_BASE_URL}business/webhook/update/`, {
        json: {
          app_id: clientId,
          secret: clientSecret,
          event_type: "DIRECT_MESSAGE",
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
