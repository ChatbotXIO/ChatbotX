import type { FanOutOps } from "@chatbotx.io/business"
import { subscribePageToInstagramWebhook } from "@chatbotx.io/integration-instagram-facebook"
import {
  exchangeLongLivedToken,
  scopesToPageSubscribeFields,
  subscribePageToAppWebhook,
} from "@chatbotx.io/integration-messenger/apis/page"

/**
 * The Graph calls behind a reconnect fan-out, shared by the builder (inline run)
 * and the worker (durable remainder). `grantedScopes` decides which Page webhook
 * fields a Messenger Page is re-subscribed to, exactly as the single reconnect
 * does; unknown scopes fall back to the base fields.
 */
export const createPublishFanOutOps = (input: {
  grantedScopes: readonly string[] | null
}): FanOutOps => ({
  exchangeLongLived: ({ accessToken, credential }) =>
    exchangeLongLivedToken(credential, accessToken),
  subscribeWebhook: async ({ accessToken, kind, pageId, version }) => {
    if (kind === "messenger") {
      await subscribePageToAppWebhook({
        accessToken,
        includeMarketingMessages: true,
        pageId,
        subscribedFields: scopesToPageSubscribeFields(
          input.grantedScopes ? [...input.grantedScopes] : undefined,
        ).join(","),
        version: version || undefined,
      })
      return
    }
    await subscribePageToInstagramWebhook({
      accessToken,
      pageId,
      version: version || undefined,
    })
  },
})
