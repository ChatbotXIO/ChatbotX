"use client"

import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { cn } from "@chatbotx.io/ui/lib/utils"
import Link from "next/link"
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
import { connectInstagramCustomCapiAction } from "../actions/connect-custom-capi.action"
import { disconnectInstagramCapiAction } from "../actions/disconnect-capi.action"
import { provisionInstagramCapiDatasetAction } from "../actions/provision-capi-dataset.action"
import { setInstagramCapiDatasetAction } from "../actions/set-capi-dataset.action"

type InstagramCapiTabProps = {
  integrationInstagram: Pick<
    IntegrationInstagramModel,
    "id" | "type" | "hasCapiScope" | "datasetId"
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
  integrationInstagram,
  workspaceId,
}: {
  connectionState: CapiConnectionState
  integrationInstagram: InstagramCapiTabProps["integrationInstagram"]
  workspaceId: string
}) {
  if (connectionState === "disconnected") {
    return (
      <CapiMethodChooser
        actions={{
          connectCustom: connectInstagramCustomCapiAction,
          setDataset: setInstagramCapiDatasetAction,
          provision: provisionInstagramCapiDatasetAction,
        }}
        datasetId={integrationInstagram.datasetId}
        integrationId={integrationInstagram.id}
        workspaceId={workspaceId}
      />
    )
  }
  return (
    <CapiConnectedCard
      datasetId={integrationInstagram.datasetId}
      disconnectAction={disconnectInstagramCapiAction}
      integrationId={integrationInstagram.id}
      workspaceId={workspaceId}
    />
  )
}

export function InstagramCapiTab({
  integrationInstagram,
  hasManualCapiAccessToken,
  capiDisconnected,
  credentialAvailable,
}: InstagramCapiTabProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const supported = integrationInstagram.type === "facebook"
  const connectionState = getCapiConnectionState({
    capiDisconnected,
    hasManualCapiAccessToken,
    hasCapiScope: integrationInstagram.hasCapiScope,
    hasDatasetId: Boolean(integrationInstagram.datasetId),
  })
  const status = getCapiStatus({
    hasCapiScope: !capiDisconnected && integrationInstagram.hasCapiScope,
    hasManualCapiAccessToken,
    hasDatasetId: Boolean(integrationInstagram.datasetId),
    credentialAvailable,
    supported,
  })
  const statusConfig = capiStatusConfig[status]

  const connectionContent = renderConnectionContent({
    connectionState,
    integrationInstagram,
    workspaceId,
  })

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
          {supported ? (
            connectionContent
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-md border bg-muted/30 p-4">
              <p className="text-muted-foreground text-sm">
                {t("metaConversions.unsupportedExplanation")}
              </p>
              <Link
                className={buttonVariants()}
                href={`/channels/create?channel=instagram-facebook&workspaceId=${workspaceId}`}
              >
                {t("metaConversions.connectViaFacebook")}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
