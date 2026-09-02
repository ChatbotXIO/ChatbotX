import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { MessagingAdsToolView } from "@/features/ads-campaign/components/messaging-ads-tool-view"
import { selectMessagingAdsToolIntegration } from "@/features/ads-campaign/lib/select-tool-integration"
import { parseMessagingAdsToolChannel } from "@/features/ads-campaign/lib/tool-channels"
import { checkMessagingAdsConnectionState } from "@/features/ads-campaign/queries"
import { listActiveMessagingAdsIntegrationIds } from "@/features/ads-campaign/queries/tool-active-integration-ids"
import { listMessagingAdsToolIntegrations } from "@/features/ads-campaign/queries/tool-integrations"
import { messagingAdsToolSearchParamsCache } from "@/features/ads-campaign/schema/tool-search-params"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

/**
 * Standalone Click to Message Ads tool — one page, one channel tab per
 * ads-eligible channel (plan §2). Guarded `superAdmin` like every channel
 * `[id]` layout that used to host `MessagingAdsBox`; the Tools card hides
 * itself from non-super-admins (`tools/page.tsx`) so a `flows` member never
 * hits this 404 in practice.
 */
export default async function MessagingAdsToolChannelPage(props: {
  params: Promise<{ workspaceId: string; channel: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = await resolveGuardedWorkspaceId(
    props.params,
    "superAdmin",
  )
  const { channel: channelParam } = await props.params
  const channel = parseMessagingAdsToolChannel(channelParam)

  const { integration: requestedId } = messagingAdsToolSearchParamsCache.parse(
    await props.searchParams,
  )

  const [{ integrations, hasUnsupportedIntegrations }, activeIntegrationIds] =
    await Promise.all([
      listMessagingAdsToolIntegrations({ workspaceId, channel }),
      listActiveMessagingAdsIntegrationIds({ workspaceId, channel }),
    ])

  const selectedIntegration = selectMessagingAdsToolIntegration({
    integrations,
    requestedId,
    activeIntegrationIds,
  })

  const initialConnectionState = selectedIntegration
    ? await checkMessagingAdsConnectionState({
        workspaceId,
        channel,
        integrationId: selectedIntegration.id,
      })
    : null

  const t = await getTranslations()

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("clickToMessageAds.title"), href: "" },
        ]}
      />
      <Suspense>
        <MessagingAdsToolView
          channel={channel}
          hasUnsupportedIntegrations={hasUnsupportedIntegrations}
          initialConnectionState={initialConnectionState}
          integrations={integrations}
          selectedIntegration={selectedIntegration}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
