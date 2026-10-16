"use client"

import type { CapiConnection } from "@chatbotx.io/business/meta-conversions/connection-state"
import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import { useTranslations } from "next-intl"
import { CapiConnectionTab } from "@/features/meta-conversions/components/capi-connection-tab"
import { useWorkspaceId } from "@/hooks/routing"
import { connectWhatsappCustomCapiAction } from "../actions/connect-custom-capi.action"
import { disconnectWhatsappCapiAction } from "../actions/disconnect-capi.action"
import { WhatsappCapiConnectButton } from "./whatsapp-capi-connect-button"

type WhatsappCapiTabProps = {
  integrationWhatsapp: Pick<
    IntegrationWhatsappModel,
    "id" | "datasetId" | "capiTestEventCode" | "isCoexist"
  >
  connection: CapiConnection
  /** Public settings of the platform's WhatsApp app; `null` when none is configured. */
  settings: WhatsappCredentialPublic | null
  /** Callback URL registered with Meta for this credential (see `lib/provider-origin.ts`). */
  oauthCallbackUrl: string
}

export function WhatsappCapiTab({
  integrationWhatsapp,
  connection,
  settings,
  oauthCallbackUrl,
}: WhatsappCapiTabProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  return (
    <CapiConnectionTab
      channel="whatsapp"
      connectCustomAction={connectWhatsappCustomCapiAction}
      connection={connection}
      connectSlot={
        <WhatsappCapiConnectButton
          integrationWhatsappId={integrationWhatsapp.id}
          isCoexist={integrationWhatsapp.isCoexist}
          oauthCallbackUrl={oauthCallbackUrl}
          settings={settings}
          workspaceId={workspaceId}
        />
      }
      disconnectAction={disconnectWhatsappCapiAction}
      footnote={
        <p className="text-muted-foreground text-xs">
          {t("metaConversions.flowStep.whatsappNote")}
        </p>
      }
      integration={integrationWhatsapp}
    />
  )
}
