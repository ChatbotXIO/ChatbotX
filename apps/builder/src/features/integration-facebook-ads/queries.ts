import {
  buildContext,
  integrationFacebookAdsService,
} from "@chatbotx.io/business"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import { facebookAdsAuthSchema } from "@chatbotx.io/integration-facebook-ads"

export const getFacebookAdsContext = async (workspaceId: string) => {
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
