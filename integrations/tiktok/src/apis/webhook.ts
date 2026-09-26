import ky from "ky"
import { BUSINESS_API_URL } from "../constants"
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
 * Note the two namespaces do NOT share values: `event_type` here is the
 * subscription kind (`DIRECT_MESSAGE`), while the `event` field TikTok later
 * pushes carries `im_receive_msg` / `comment.update`. Subscribing to
 * `"comment.update"` would be rejected.
 */
/**
 * The subscription kind that delivers DMs. Required — without it no inbox.
 *
 * It also delivers `im_receive_high_intent_comment`, the Comment-to-Message
 * event that carries the only `comment_id` a `direct_reply` DM will accept.
 * Despite naming a comment it does NOT ride the `COMMENT` subscription below,
 * so there is no third `event_type` to register: an account receives it once
 * this subscription exists AND Comment-to-Message is enabled on that account
 * via `business/message/direct_reply/update/`.
 */
export const TIKTOK_DIRECT_MESSAGE_EVENT_TYPE = "DIRECT_MESSAGE"

/**
 * The subscription kind that delivers `comment.update`.
 *
 * `COMMENT` is the event CATEGORY; `comment.update` is the `event` value TikTok
 * then pushes inside it. Subscribing to `"comment.update"` is rejected — the
 * two namespaces do not share values, which is why DMs arrived on production
 * and comments did not while only `DIRECT_MESSAGE` was ever registered.
 *
 * Two things the account-webhook docs make conditional on this:
 * - The account owner must have granted `comment.list`. Without it TikTok
 *   delivers nothing, and a revoked authorization stops delivery silently.
 * - `item_list` narrows delivery to specific post ids. It is deliberately NOT
 *   sent: omitted, TikTok notifies for every post under every authorized
 *   account, which is what the "all posts" targeting option needs. Beware that
 *   the setting is per developer app and CUMULATIVE — once an `item_list` has
 *   been configured, later requests add to it and omitting it no longer means
 *   "all posts", so sending one here would be a one-way door.
 */
export const TIKTOK_COMMENT_EVENT_TYPE = "COMMENT"

export const subscribeWebhook = (
  { clientId, clientSecret }: { clientId: string; clientSecret: string },
  callbackUrl: string,
  eventType = "DIRECT_MESSAGE",
): Promise<void> =>
  rescue("business/webhook/update", async () => {
    const response = await ky
      .post(`${BUSINESS_API_URL}business/webhook/update/`, {
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

/**
 * Registers every subscription the channel needs, in one call from the
 * credential-save path.
 *
 * The two kinds are deliberately NOT equal in weight. `DIRECT_MESSAGE` stays
 * fatal: without it the inbox receives nothing and saving a credential that
 * cannot work would be worse than refusing. The comment subscription is
 * best-effort — a rejected `event_type` must not stop an admin saving their
 * TikTok settings, which is exactly the risk that kept the value unset for so
 * long. Comments simply keep not arriving, the same as today, and the reason
 * is in the log instead of in a failed form submission.
 *
 * Returns whether the comment subscription is in place so the caller can say
 * so; a skipped one (no `event_type` known yet) reports `false` without
 * spending a request.
 */
export const subscribeTiktokWebhooks = async (
  credentials: { clientId: string; clientSecret: string },
  callbackUrl: string,
  onCommentSubscriptionError?: (error: unknown) => void,
): Promise<{ comments: boolean }> => {
  await subscribeWebhook(
    credentials,
    callbackUrl,
    TIKTOK_DIRECT_MESSAGE_EVENT_TYPE,
  )

  if (!TIKTOK_COMMENT_EVENT_TYPE) {
    return { comments: false }
  }

  try {
    await subscribeWebhook(credentials, callbackUrl, TIKTOK_COMMENT_EVENT_TYPE)
    return { comments: true }
  } catch (error) {
    onCommentSubscriptionError?.(error)
    return { comments: false }
  }
}
