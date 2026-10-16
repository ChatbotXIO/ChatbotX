"use client"

import type { CapiConnection } from "@chatbotx.io/business/meta-conversions/connection-state"
import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { CapiConnectButton } from "@/features/meta-conversions/components/capi-connect-button"
import { CapiConnectionTab } from "@/features/meta-conversions/components/capi-connection-tab"
import { useWorkspaceId } from "@/hooks/routing"
import { connectInstagramCapiAction } from "../actions/connect-capi.action"
import { connectInstagramCustomCapiAction } from "../actions/connect-custom-capi.action"
import { disconnectInstagramCapiAction } from "../actions/disconnect-capi.action"

type InstagramCapiTabProps = {
  integrationInstagram: Pick<
    IntegrationInstagramModel,
    "id" | "type" | "datasetId" | "capiTestEventCode"
  >
  connection: CapiConnection
}

export function InstagramCapiTab({
  integrationInstagram,
  connection,
}: InstagramCapiTabProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const supported = integrationInstagram.type === "facebook"

  return (
    <CapiConnectionTab
      channel="instagram"
      connectCustomAction={connectInstagramCustomCapiAction}
      connection={connection}
      connectSlot={
        <CapiConnectButton
          connectAction={connectInstagramCapiAction}
          integrationId={integrationInstagram.id}
          isReconnect={connection === "reconnect"}
          workspaceId={workspaceId}
        />
      }
      disconnectAction={disconnectInstagramCapiAction}
      integration={integrationInstagram}
      unsupportedContent={
        supported ? undefined : (
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
        )
      }
    />
  )
}
