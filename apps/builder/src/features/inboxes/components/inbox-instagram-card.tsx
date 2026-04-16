"use client"

import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { memo, useMemo } from "react"
import { ScanQRCodeDialog } from "@/features/qrcode/scan-qrcode"
import { getInboxLink } from "@/features/reflinks/helpers"
import type { InboxResource } from "../schema/resource"
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
        <InboxIcon channel="instagram" label={inbox.name} />

        <ScanQRCodeDialog
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
