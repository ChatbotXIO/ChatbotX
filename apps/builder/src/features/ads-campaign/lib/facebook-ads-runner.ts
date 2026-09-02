import { buildMessagingAdsContext } from "@chatbotx.io/business"
import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import { integration as facebookAdsIntegration } from "@chatbotx.io/integration-facebook-ads"

/**
 * Resolves the decrypted Facebook Ads context + the `Integration` dispatcher
 * for ONE channel integration's messaging-ads connection — every wizard
 * pre-create/read endpoint (`getAdAccountDetails`, `uploadAdVideo`,
 * `getAdVideoStatus`) resolves auth this way instead of the workspace-wide
 * Facebook Ads connection, per out/plan/ctwa-ctm-ctid-box-merge.md
 * "Auth = per-integration". Images no longer upload to Meta at wizard time —
 * the browser uploads straight to presigned S3, and the create-time hash
 * derivation runs through `messagingAdCampaignService` instead (which
 * resolves its own context via `buildMessagingAdsContext`).
 */
export async function getMessagingAdsContextForIntegration(input: {
  workspaceId: string
  channel: MessagingAdChannel
  integrationId: string
}) {
  const ctx = await buildMessagingAdsContext(input)
  return { ctx, integration: facebookAdsIntegration }
}
