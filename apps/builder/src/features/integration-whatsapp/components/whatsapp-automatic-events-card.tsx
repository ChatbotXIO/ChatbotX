"use client"

import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
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
import {
  getPermissionStatus,
  permissionStatusConfig,
} from "../libs/permission-status"
import { WhatsappReconnectButton } from "./whatsapp-reconnect-button"

export type AutomaticEventsIntegration = {
  id: string
  name: string
  displayPhoneNumber: string
  wabaId: string
  hasCapiScope: boolean
}

export function WhatsappAutomaticEventsCard({
  integrationWhatsapp,
  whatsappCredentialPublic,
  workspaceId,
}: {
  integrationWhatsapp: AutomaticEventsIntegration
  whatsappCredentialPublic: WhatsappCredentialPublic | null
  workspaceId: string
}) {
  const t = useTranslations()
  const status = getPermissionStatus(
    integrationWhatsapp,
    whatsappCredentialPublic,
  )
  const statusConfig = permissionStatusConfig[status]

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle>{t("whatsapp.capi.automaticEvents.title")}</CardTitle>
            <CardDescription>
              {t("whatsapp.capi.automaticEvents.description")}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-sm">
              {integrationWhatsapp.name} —{" "}
              {integrationWhatsapp.displayPhoneNumber}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("ads.connectAccounts.table.wabaId")}:{" "}
              {integrationWhatsapp.wabaId}
            </span>
          </div>
          {status === "missingPermission" && (
            <WhatsappReconnectButton
              integrationWhatsappId={integrationWhatsapp.id}
              settings={whatsappCredentialPublic}
              workspaceId={workspaceId}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
