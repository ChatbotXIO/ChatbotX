import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import { facebookAdsAuthSchema } from "@chatbotx.io/integration-facebook-ads"
import { buildContext } from "../integration-context/build-context"
import { integrationFacebookAdsService } from "../integration-facebook-ads"

export { integration as facebookAdsIntegration } from "@chatbotx.io/integration-facebook-ads"

/**
 * Resolves the decrypted `IntegrationContext` the Facebook Ads SDK
 * `runAction` dispatcher needs. Mirrors `getFacebookAdsContext` in
 * `apps/builder/src/features/integration-facebook-ads/queries.ts` — kept as
 * its own copy here (rather than importing the builder app's copy, which
 * `packages/business` cannot do) so `messagingAdCampaignService` can resolve
 * Graph auth without a round trip through the app layer, per
 * out/plan/ctm-ctid-ads-manager.md "Architecture" ("all Graph access via the
 * integration layer").
 */
export async function buildFacebookAdsContext(workspaceId: string) {
  const row =
    await integrationFacebookAdsService.findByWorkspaceIdOrFail(workspaceId)
  const auth = await encryptUtils.decryptObject(
    encryptedDataSchema.parse(row.auth),
    facebookAdsAuthSchema,
  )
  return buildContext({
    workspaceId,
    integrationType: "facebookAds",
    integration: { ...row, auth },
  })
}
