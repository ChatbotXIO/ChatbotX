"use client"

import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
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
import { CapiTestEventCard } from "@/features/meta-conversions/components/capi-test-event-card"
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
import { connectWhatsappCustomCapiAction } from "../actions/connect-custom-capi.action"
import { disconnectWhatsappCapiAction } from "../actions/disconnect-capi.action"
import { provisionWhatsappCapiDatasetAction } from "../actions/provision-capi-dataset.action"
import { setWhatsappCapiDatasetAction } from "../actions/set-capi-dataset.action"
import { WhatsappAutomaticEventsCard } from "./whatsapp-automatic-events-card"

type WhatsappCapiTabProps = {
  integrationWhatsapp: Pick<
    IntegrationWhatsappModel,
    | "id"
    | "name"
    | "displayPhoneNumber"
    | "wabaId"
    | "hasCapiScope"
    | "datasetId"
    | "capiTestEventCode"
  >
  hasManualCapiAccessToken: boolean
  capiDisconnected: boolean
  credentialAvailable: boolean
  whatsappCredentialPublic: WhatsappCredentialPublic | null
  oauthCallbackUrl: string
}

const statusDescriptionKey = {
  ready: "metaConversions.statusDescriptions.ready",
  notConnected: "metaConversions.statusDescriptions.notConnected",
  missingPermission: "metaConversions.statusDescriptions.missingPermission",
  unverified: "metaConversions.statusDescriptions.unverified",
  unsupported: "metaConversions.statusDescriptions.unsupported",
} as const satisfies Record<CapiStatus, string>

function renderConnectionContent({
  connectionState,
  integrationWhatsapp,
  workspaceId,
  notice,
}: {
  connectionState: CapiConnectionState
  integrationWhatsapp: WhatsappCapiTabProps["integrationWhatsapp"]
  workspaceId: string
  notice: string
}) {
  if (connectionState === "disconnected") {
    return (
      <CapiMethodChooser
        actions={{
          connectCustom: connectWhatsappCustomCapiAction,
          setDataset: setWhatsappCapiDatasetAction,
          provision: provisionWhatsappCapiDatasetAction,
        }}
        datasetId={integrationWhatsapp.datasetId}
        integrationId={integrationWhatsapp.id}
        primaryMethod="whatsapp"
        workspaceId={workspaceId}
      />
    )
  }
  return (
    <>
      <CapiConnectedCard
        datasetId={integrationWhatsapp.datasetId}
        disconnectAction={disconnectWhatsappCapiAction}
        integrationId={integrationWhatsapp.id}
        notice={connectionState === "awaitingScope" ? notice : undefined}
        workspaceId={workspaceId}
      />
      {/* Sending needs the Meta scope or a manual token; while the scope is
          still missing a test would only be skipped, so hide the card. */}
      {connectionState === "awaitingScope" ? null : (
        <CapiTestEventCard
          channel="whatsapp"
          datasetId={integrationWhatsapp.datasetId}
          integrationId={integrationWhatsapp.id}
          testEventCode={integrationWhatsapp.capiTestEventCode}
          workspaceId={workspaceId}
        />
      )}
    </>
  )
}

export function WhatsappCapiTab({
  integrationWhatsapp,
  hasManualCapiAccessToken,
  capiDisconnected,
  credentialAvailable,
  whatsappCredentialPublic,
  oauthCallbackUrl,
}: WhatsappCapiTabProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const connectionState = getCapiConnectionState({
    capiDisconnected,
    hasManualCapiAccessToken,
    hasCapiScope: integrationWhatsapp.hasCapiScope,
    hasDatasetId: Boolean(integrationWhatsapp.datasetId),
  })
  const status = getCapiStatus({
    hasCapiScope: integrationWhatsapp.hasCapiScope,
    capiDisconnected,
    hasManualCapiAccessToken,
    hasDatasetId: Boolean(integrationWhatsapp.datasetId),
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
            integrationWhatsapp,
            workspaceId,
            notice: t("metaConversions.statusDescriptions.missingPermission"),
          })}
          <p className="text-muted-foreground text-xs">
            {t("metaConversions.flowStep.whatsappNote")}
          </p>
        </CardContent>
      </Card>
      <WhatsappAutomaticEventsCard
        integrationWhatsapp={integrationWhatsapp}
        oauthCallbackUrl={oauthCallbackUrl}
        whatsappCredentialPublic={whatsappCredentialPublic}
        workspaceId={workspaceId}
      />
    </div>
  )
}
