"use client"

import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { memo, useMemo } from "react"
import { ScanQRCodeDiaglog } from "@/features/qrcode/scan-qrcode"
import { getInboxLink } from "@/features/reflinks/helpers"
import type { InboxResource } from "../schemas/resource"
import { InboxIcon } from "./inbox-icon"

type InboxInstagramCardProps = {
  inbox: InboxResource
}

export const InboxInstagramCard = memo(function InboxInstagramCard({
  inbox,
}: InboxInstagramCardProps) {
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
        <InboxIcon
          inboxType="instagram"
          label={inbox.integrationInstagram?.name}
        />

        <ScanQRCodeDiaglog
          link={link}
          title={t("actions.connectFeature", {
            feature: "Instagram",
          })}
          triggerName={t("actions.testNow")}
        />
      </CardContent>
    </Card>
  )
})
