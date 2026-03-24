"use client"

import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { memo, useMemo } from "react"
import { ScanQRCodeDialog } from "@/features/qrcode/scan-qrcode"
import { getInboxLink } from "@/features/reflinks/helpers"
import type { InboxResource } from "../schemas/resource"
import { InboxIcon } from "./inbox-icon"

type InboxWebchatCardProps = {
  inbox: InboxResource
}

export const InboxWebchatCard = memo(function InboxWebchatCard({
  inbox,
}: InboxWebchatCardProps) {
  const t = useTranslations()
  const link = useMemo(
    () =>
      getInboxLink({
        inbox,
      }),
    [inbox],
  )

  return (
    <Card className="py-3">
      <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
        <InboxIcon channel="webchat" label={inbox.name} />

        <ScanQRCodeDialog
          link={link}
          title={t("actions.connectFeature", {
            feature: t("fields.webchat.label"),
          })}
          triggerName={t("actions.testNow")}
        />
      </CardContent>
    </Card>
  )
})
