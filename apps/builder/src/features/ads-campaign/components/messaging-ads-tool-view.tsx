import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { resolveMessagingAdsToolEmptyState } from "../lib/tool-empty-state"
import { buildMessagingAdsDashboardPath } from "../lib/tool-path"
import type { MessagingAdsToolIntegration } from "../queries/tool-integrations"
import { MessagingAdsBox } from "./messaging-ads-box"
import { MessagingAdsIntegrationFilter } from "./messaging-ads-integration-filter"
import { MessagingAdsToolEmptyState } from "./messaging-ads-tool-empty-state"
import { MessagingAdsToolTabs } from "./messaging-ads-tool-tabs"

type ConnectionState = { connected: boolean; reconnectNeeded: boolean }

type Props = {
  workspaceId: string
  channel: MessagingAdChannel
  integrations: MessagingAdsToolIntegration[]
  hasUnsupportedIntegrations: boolean
  selectedIntegration: MessagingAdsToolIntegration | null
  initialConnectionState: ConnectionState | null
}

/**
 * Composes the Click to Message Ads tool page body: channel tabs, then
 * either an empty state or the existing `MessagingAdsBox` (with the
 * integration filter injected into its header via `integrationSelector`)
 * + a hint linking to the matching Ads dashboard
 * filter (repurposed `adsCampaign.box.emptyDashboardNote`, plan decision
 * #11). All props are plain, serializable values — the connection row's
 * encrypted `auth` never reaches this component.
 */
export async function MessagingAdsToolView({
  workspaceId,
  channel,
  integrations,
  hasUnsupportedIntegrations,
  selectedIntegration,
  initialConnectionState,
}: Props) {
  const t = await getTranslations()
  const emptyState = resolveMessagingAdsToolEmptyState({
    channel,
    integrations,
    hasUnsupportedIntegrations,
  })

  return (
    <div className="flex flex-col gap-4">
      <MessagingAdsToolTabs />

      {emptyState && (
        <MessagingAdsToolEmptyState
          config={emptyState}
          workspaceId={workspaceId}
        />
      )}

      {!emptyState && selectedIntegration && initialConnectionState && (
        <div className="flex flex-col gap-4">
          <MessagingAdsBox
            channel={channel}
            initialConnectionState={initialConnectionState}
            integrationId={selectedIntegration.id}
            integrationSelector={
              <MessagingAdsIntegrationFilter
                integrations={integrations}
                selectedIntegrationId={selectedIntegration.id}
              />
            }
            workspaceId={workspaceId}
          />
          <p className="text-muted-foreground text-sm">
            {t("adsCampaign.box.emptyDashboardNote")}{" "}
            <Link
              className={buttonVariants({
                variant: "link",
                className: "h-auto p-0 align-baseline",
              })}
              href={buildMessagingAdsDashboardPath({
                workspaceId,
                channel,
                integrationId: selectedIntegration.id,
              })}
            >
              {t("clickToMessageAds.dashboardCta")}
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}
