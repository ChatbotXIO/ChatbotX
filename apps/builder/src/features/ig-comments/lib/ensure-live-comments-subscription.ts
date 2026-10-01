import "server-only"

import { instagramIntegrationService } from "@chatbotx.io/business"
import {
  type CommentPost,
  type IgCommentAutomationType,
  isLiveCommentAutomation,
} from "@chatbotx.io/database/partials"
import {
  type InstagramAuthValue,
  subscribePageToInstagramWebhook,
} from "@chatbotx.io/integration-instagram"
import { collectSettled } from "@/lib/collect-settled"

/**
 * Re-subscribes the workspace's Instagram Login accounts so their webhook
 * includes `live_comments`.
 *
 * The field list is only sent at connect/reconnect time, so an account
 * connected before Live automations existed receives no live comments at all —
 * the automation would look saved and simply never fire. Re-posting the full
 * field list is idempotent. Best-effort: a failure is logged, never surfaced,
 * because the automation itself was saved fine and a reconnect also fixes it.
 *
 * Instagram via Facebook Login needs nothing here: its `live_comments` field is
 * subscribed once on the App Dashboard's `instagram` object, not per account.
 */
export async function ensureInstagramLiveCommentsSubscription(
  workspaceId: string,
): Promise<void> {
  const integrations = await instagramIntegrationService.findByWorkspaceId(
    workspaceId,
    "instagram",
  )
  await collectSettled(
    integrations,
    async (integration) => {
      const auth = integration.auth as InstagramAuthValue
      await subscribePageToInstagramWebhook({
        igId: integration.igId,
        accessToken: auth.tokens.accessToken,
        version: auth.metadata.version,
      })
      return []
    },
    (integration) => ({ integrationId: integration.id }),
    "Failed to subscribe Instagram account to live_comments",
  )
}

/**
 * Called after every Instagram automation create — builder action, private
 * API and public API alike — so no entry point can save a Live automation
 * that silently never fires.
 */
export async function ensureLiveCommentsSubscriptionForAutomation(props: {
  workspaceId: string
  type: IgCommentAutomationType
  /** Optional only for callers that bypass request validation. */
  post?: CommentPost
}): Promise<void> {
  if (
    props.type === "instagram" &&
    props.post &&
    isLiveCommentAutomation(props.post)
  ) {
    await ensureInstagramLiveCommentsSubscription(props.workspaceId)
  }
}
