import { buildMessagingAdsContext } from "@chatbotx.io/business"
import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import { integration as facebookAdsIntegration } from "@chatbotx.io/integration-facebook-ads"

/**
 * Resolves the decrypted Facebook Ads context + the `Integration` dispatcher
 * for ONE channel integration's messaging-ads connection — every wizard
 * pre-create/read endpoint (`getAdAccountDetails`, `uploadAdImage`,
 * `uploadAdVideo`, `getAdVideoStatus`) resolves auth this way instead of the
 * workspace-wide Facebook Ads connection, per
 * out/plan/ctwa-ctm-ctid-box-merge.md "Auth = per-integration".
 */
export async function getMessagingAdsContextForIntegration(input: {
  workspaceId: string
  channel: MessagingAdChannel
  integrationId: string
}) {
  const ctx = await buildMessagingAdsContext(input)
  return { ctx, integration: facebookAdsIntegration }
}
