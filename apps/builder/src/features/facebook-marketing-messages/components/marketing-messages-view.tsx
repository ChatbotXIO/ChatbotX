"use client"

import type { FacebookMarketingMessageModel } from "@chatbotx.io/database/types"
import type { MarketingMessagesGrant } from "../lib/grant"
import type { MarketingMessagesTab } from "../lib/tab"
import type { CampaignCounts } from "../queries"
import { AudiencesTable } from "./audiences/audiences-table"
import { GrantPanel } from "./grant-panel"
import { MarketingMessagesTable } from "./marketing-messages-table"
import { MarketingMessagesTabs } from "./marketing-messages-tabs"
import { StatisticsTable } from "./statistics/statistics-table"

export function MarketingMessagesView({
  workspaceId,
  counts,
  grantState,
  rows,
  tab,
}: {
  workspaceId: string
  counts: Record<string, CampaignCounts>
  grantState: MarketingMessagesGrant["state"]
  rows: FacebookMarketingMessageModel[]
  tab: MarketingMessagesTab
}) {
  if (grantState === "missing") {
    return <GrantPanel state="missing" workspaceId={workspaceId} />
  }

  const readOnly = grantState === "expired"
  return (
    <div className="flex flex-col gap-4">
      {readOnly && <GrantPanel state="expired" workspaceId={workspaceId} />}
      <MarketingMessagesTabs
        audiences={
          <AudiencesTable readOnly={readOnly} workspaceId={workspaceId} />
        }
        campaigns={
          <MarketingMessagesTable
            counts={counts}
            readOnly={readOnly}
            rows={rows}
            workspaceId={workspaceId}
          />
        }
        statistics={
          <StatisticsTable readOnly={readOnly} workspaceId={workspaceId} />
        }
        tab={tab}
      />
    </div>
  )
}
