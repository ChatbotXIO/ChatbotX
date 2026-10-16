"use client"

import type { CapiConnection } from "@chatbotx.io/business/meta-conversions/connection-state"
import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import { CapiConnectButton } from "@/features/meta-conversions/components/capi-connect-button"
import { CapiConnectionTab } from "@/features/meta-conversions/components/capi-connection-tab"
import { useWorkspaceId } from "@/hooks/routing"
import { connectMessengerCapiAction } from "../actions/connect-capi.action"
import { connectMessengerCustomCapiAction } from "../actions/connect-custom-capi.action"
import { disconnectMessengerCapiAction } from "../actions/disconnect-capi.action"

type MessengerCapiTabProps = {
  integrationMessenger: Pick<
    IntegrationMessengerModel,
    "id" | "datasetId" | "capiTestEventCode"
  >
  connection: CapiConnection
}

export function MessengerCapiTab({
  integrationMessenger,
  connection,
}: MessengerCapiTabProps) {
  const workspaceId = useWorkspaceId()

  return (
    <CapiConnectionTab
      channel="messenger"
      connectCustomAction={connectMessengerCustomCapiAction}
      connection={connection}
      connectSlot={
        <CapiConnectButton
          connectAction={connectMessengerCapiAction}
          integrationId={integrationMessenger.id}
          isReconnect={connection === "reconnect"}
          workspaceId={workspaceId}
        />
      }
      disconnectAction={disconnectMessengerCapiAction}
      integration={integrationMessenger}
    />
  )
}
