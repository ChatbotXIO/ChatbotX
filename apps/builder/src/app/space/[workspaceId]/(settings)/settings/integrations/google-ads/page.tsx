import { getIdFromParams } from "@chatbotx.io/utils"
import { CONNECT_ERROR_QUERY_PARAM } from "@chatbotx.io/utils/connection"
import { notFound } from "next/navigation"
import { GoogleAdsSettings } from "@/features/integration-google-ads/components/google-ads-settings"
import { loadGoogleAdsSettingsPage } from "@/features/integration-google-ads/lib/load-settings-page"
import { parseConnectErrorParam } from "@/features/integration-google-ads/lib/load-settings-session"

export default async function SettingIntegrationGoogleAdsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const { setup, isConfigured, session, consent } =
    await loadGoogleAdsSettingsPage({ workspaceId, searchParams })

  return (
    <GoogleAdsSettings
      connectError={parseConnectErrorParam(
        searchParams[CONNECT_ERROR_QUERY_PARAM],
      )}
      consent={consent}
      initialSession={session}
      isConfigured={isConfigured}
      setup={setup}
      workspaceId={workspaceId}
    />
  )
}
