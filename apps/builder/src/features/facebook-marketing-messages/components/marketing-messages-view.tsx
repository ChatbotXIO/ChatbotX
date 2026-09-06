"use client"

import type { FacebookMarketingMessageModel } from "@chatbotx.io/database/types"
import type { MarketingMessagesGrant } from "../lib/grant"
import { GrantPanel } from "./grant-panel"
import { MarketingMessagesTable } from "./marketing-messages-table"

export function MarketingMessagesView({
  workspaceId,
  grantState,
  rows,
}: {
  workspaceId: string
  grantState: MarketingMessagesGrant["state"]
  rows: FacebookMarketingMessageModel[]
}) {
  if (grantState === "missing") {
    return <GrantPanel state="missing" workspaceId={workspaceId} />
  }

  return (
    <div className="flex flex-col gap-4">
      {grantState === "expired" && (
        <GrantPanel state="expired" workspaceId={workspaceId} />
      )}
      <MarketingMessagesTable
        readOnly={grantState === "expired"}
        rows={rows}
        workspaceId={workspaceId}
      />
    </div>
  )
}
