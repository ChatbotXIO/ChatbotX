"use client"

import type { ListInboxesResponse } from "@chatbotx.io/business"
import { buildInboxLink } from "@chatbotx.io/business/utils"
import type { ChannelType } from "@chatbotx.io/database/partials"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { memo } from "react"
import { ScanQRCodeDialog } from "@/features/qr-codes/scan-qrcode"
import { useTenantSettings } from "@/features/tenant"
import { InboxIcon } from "./inbox-icon"
import InboxNewCard from "./inbox-new-card"

type InboxCardListProps = {
  workspaceId: string
  allowAddNew?: boolean
  inboxes: ListInboxesResponse["data"]
}

export function InboxCardList({
  workspaceId,
  allowAddNew = true,
  inboxes,
}: InboxCardListProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {inboxes.map((inbox) => (
        <BaseInboxCard inbox={inbox} key={inbox.id} />
      ))}

      {allowAddNew && <InboxNewCard workspaceId={workspaceId} />}
    </div>
  )
}

const BaseInboxCard = memo(function BaseInboxCard({
  inbox,
}: {
  inbox: ListInboxesResponse["data"][number]
}) {
  const t = useTranslations()
  const { appUrl } = useTenantSettings()
  const link = buildInboxLink(appUrl, inbox as InboxWithIntegrations)

  if (!link) {
    return
  }

  return (
    <Card className="py-3">
      <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
        <InboxIcon channel={inbox.channel as ChannelType} label={inbox.name} />

        <ScanQRCodeDialog
          link={link}
          title={t("actions.connectFeature", {
            feature: inbox.name,
          })}
          triggerName={t("actions.testNow")}
        />
      </CardContent>
    </Card>
  )
})
