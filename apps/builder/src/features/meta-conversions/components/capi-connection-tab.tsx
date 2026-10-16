"use client"

import type { MetaConversionsChannel } from "@chatbotx.io/business"
import type { CapiConnection } from "@chatbotx.io/business/meta-conversions/connection-state"
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
import type { ComponentProps, ReactNode } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { useCapiConnectResult } from "@/hooks/use-capi-connect-result"
import {
  type CapiStatus,
  capiStatusConfig,
  getCapiStatus,
} from "../lib/capi-status"
import { CapiConnectCard } from "./capi-connect-card"
import { CapiConnectedCard } from "./capi-connected-card"
import { CapiTestEventCard } from "./capi-test-event-card"

const statusDescriptionKey = {
  ready: "metaConversions.statusDescriptions.ready",
  notConnected: "metaConversions.statusDescriptions.notConnected",
  unsupported: "metaConversions.statusDescriptions.unsupported",
} as const satisfies Record<CapiStatus, string>

type CapiConnectionTabProps = {
  channel: MetaConversionsChannel
  connection: CapiConnection
  integration: {
    id: string
    datasetId: string | null
    capiTestEventCode: string | null
  }
  disconnectAction: ComponentProps<typeof CapiConnectedCard>["disconnectAction"]
  connectCustomAction: ComponentProps<
    typeof CapiConnectCard
  >["connectCustomAction"]
  /** The channel's own Connect button. */
  connectSlot: ReactNode
  /** Replaces the whole body for an account that cannot use the Conversions API. */
  unsupportedContent?: ReactNode
  footnote?: ReactNode
}

/**
 * The Conversions API tab every Meta channel shares: a status header, then
 * either the Connect options or the connected card with Test events. The channel
 * only supplies what differs — its Connect button, its actions, and any notice.
 */
export function CapiConnectionTab({
  channel,
  connection,
  integration,
  disconnectAction,
  connectCustomAction,
  connectSlot,
  unsupportedContent,
  footnote,
}: CapiConnectionTabProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  useCapiConnectResult()

  const status = getCapiStatus({
    connection,
    supported: unsupportedContent === undefined,
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
          {unsupportedContent ??
            (connection === "connected" ? (
              <>
                <CapiConnectedCard
                  datasetId={integration.datasetId}
                  disconnectAction={disconnectAction}
                  integrationId={integration.id}
                  workspaceId={workspaceId}
                />
                <CapiTestEventCard
                  channel={channel}
                  datasetId={integration.datasetId}
                  integrationId={integration.id}
                  testEventCode={integration.capiTestEventCode}
                  workspaceId={workspaceId}
                />
              </>
            ) : (
              <CapiConnectCard
                connectCustomAction={connectCustomAction}
                connectSlot={connectSlot}
                datasetId={integration.datasetId}
                integrationId={integration.id}
                workspaceId={workspaceId}
              />
            ))}
          {footnote}
        </CardContent>
      </Card>
    </div>
  )
}
