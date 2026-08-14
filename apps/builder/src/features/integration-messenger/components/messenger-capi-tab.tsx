"use client"

import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { CapiConnectedCard } from "@/features/meta-conversions/components/capi-connected-card"
import { CapiMethodChooser } from "@/features/meta-conversions/components/capi-method-chooser"
import {
  type CapiConnectionState,
  getCapiConnectionState,
} from "@/features/meta-conversions/lib/capi-connection-state"
import {
  type CapiStatus,
  capiStatusConfig,
  getCapiStatus,
} from "@/features/meta-conversions/lib/capi-status"
import { useWorkspaceId } from "@/hooks/routing"
import { connectMessengerCustomCapiAction } from "../actions/connect-custom-capi.action"
import { disconnectMessengerCapiAction } from "../actions/disconnect-capi.action"
import { provisionMessengerCapiDatasetAction } from "../actions/provision-capi-dataset.action"
import { setMessengerCapiDatasetAction } from "../actions/set-capi-dataset.action"

type MessengerCapiTabProps = {
  integrationMessenger: Pick<
    IntegrationMessengerModel,
    "id" | "hasCapiScope" | "datasetId"
  >
  hasManualCapiAccessToken: boolean
  capiDisconnected: boolean
  credentialAvailable: boolean
}

const statusDescriptionKey = {
  ready: "metaConversions.statusDescriptions.ready",
  notConnected: "metaConversions.statusDescriptions.notConnected",
  unverified: "metaConversions.statusDescriptions.unverified",
  unsupported: "metaConversions.statusDescriptions.unsupported",
} as const satisfies Record<CapiStatus, string>

function renderConnectionContent({
  connectionState,
  integrationMessenger,
  workspaceId,
}: {
  connectionState: CapiConnectionState
  integrationMessenger: MessengerCapiTabProps["integrationMessenger"]
  workspaceId: string
}) {
  if (connectionState === "disconnected") {
    return (
      <CapiMethodChooser
        actions={{
          connectCustom: connectMessengerCustomCapiAction,
          setDataset: setMessengerCapiDatasetAction,
          provision: provisionMessengerCapiDatasetAction,
        }}
        datasetId={integrationMessenger.datasetId}
        integrationId={integrationMessenger.id}
        workspaceId={workspaceId}
      />
    )
  }
  return (
    <CapiConnectedCard
      datasetId={integrationMessenger.datasetId}
      disconnectAction={disconnectMessengerCapiAction}
      integrationId={integrationMessenger.id}
      workspaceId={workspaceId}
    />
  )
}

export function MessengerCapiTab({
  integrationMessenger,
  hasManualCapiAccessToken,
  capiDisconnected,
  credentialAvailable,
}: MessengerCapiTabProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const connectionState = getCapiConnectionState({
    capiDisconnected,
    hasManualCapiAccessToken,
    hasCapiScope: integrationMessenger.hasCapiScope,
    hasDatasetId: Boolean(integrationMessenger.datasetId),
  })
  const status = getCapiStatus({
    hasCapiScope: !capiDisconnected && integrationMessenger.hasCapiScope,
    hasManualCapiAccessToken,
    hasDatasetId: Boolean(integrationMessenger.datasetId),
    credentialAvailable,
  })
  const statusConfig = capiStatusConfig[status]

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <CardTitle>{t("metaConversions.status.title")}</CardTitle>
              <CardDescription>
                {t(statusDescriptionKey[status])}
              </CardDescription>
            </div>
            <Badge className={cn("gap-2", statusConfig.className)}>
              <span
                className={cn("size-2 rounded-full", statusConfig.dotClassName)}
              />
              {t(statusConfig.labelKey)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {renderConnectionContent({
            connectionState,
            integrationMessenger,
            workspaceId,
          })}
        </CardContent>
      </Card>
    </div>
  )
}
