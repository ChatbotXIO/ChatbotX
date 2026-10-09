import {
  googleAdsSettingsService,
  integrationGoogleAdsService,
} from "@chatbotx.io/business"
import type { z } from "zod"
import type { googleAdsIntegrationResource } from "../schema/integration"
import { toConsentView } from "./to-consent-view"

/**
 * The credential-free connection view, shared by the private and the public
 * handler. Consent outlives a disconnect, so it is loaded on its own rather
 * than derived from the setup (which is empty when nothing is connected).
 */
export const loadGoogleAdsIntegration = async (
  workspaceId: string,
): Promise<z.input<typeof googleAdsIntegrationResource>> => {
  const [setup, consent] = await Promise.all([
    integrationGoogleAdsService.getPublicSetup(workspaceId),
    googleAdsSettingsService.getConsent(workspaceId),
  ])
  return { ...setup, consent: toConsentView(consent) }
}
