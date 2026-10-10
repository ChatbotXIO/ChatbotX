import {
  googleAdsSettingsService,
  integrationGoogleAdsService,
} from "@chatbotx.io/business"
import { SESSION_QUERY_PARAM } from "./constants"
import { loadSettingsSession } from "./load-settings-session"
import { toConsentView } from "./to-consent-view"
import { toGoogleAdsSettingsView } from "./to-settings-view"

/**
 * Everything the settings page renders from, loaded in parallel. Consent is
 * its own load (not derived from the setup) so it is present even when no
 * account is connected.
 */
export async function loadGoogleAdsSettingsPage(input: {
  workspaceId: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  const { workspaceId, searchParams } = input
  const [setup, isConfigured, session, consent] = await Promise.all([
    integrationGoogleAdsService.getSetup(workspaceId),
    integrationGoogleAdsService.isConfigured(workspaceId),
    loadSettingsSession({
      workspaceId,
      sessionParam: searchParams[SESSION_QUERY_PARAM],
    }),
    googleAdsSettingsService.getConsent(workspaceId),
  ])
  return {
    setup: toGoogleAdsSettingsView(setup),
    isConfigured,
    session,
    consent: toConsentView(consent),
  }
}
