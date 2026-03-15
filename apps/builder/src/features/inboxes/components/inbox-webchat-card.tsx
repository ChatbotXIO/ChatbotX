"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import Link from "next/link"
import { useTranslations } from "next-intl"
import QRCode from "react-qr-code"
import { getInboxLink } from "@/features/reflinks/helpers"
import type { InboxResource } from "../schemas/resource"
import { InboxIcon } from "./inbox-icon"

export function InboxWebchatCard({ inbox }: { inbox: InboxResource }) {
  const t = useTranslations()
  const link = getInboxLink({
    inbox,
  })

  return (
    <Card className="py-3" key={inbox.id}>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
        <InboxIcon inboxType="webchat" label={inbox.integrationWebchat?.name} />
        <Button size="sm" type="button" variant="secondary">
          <Link href={link} rel="noopener noreferrer" target="_blank">
            {t("actions.testNow")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function WebchatQRCodeDialog({ link }: { link: string }) {
  const t = useTranslations()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="secondary">
          {t("actions.qrCode")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("actions.connectFeature", {
              feature: t("fields.webchat.label"),
            })}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center gap-2">
          <p>{t("actions.scanQRCode")}</p>
          <QRCode value={link} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
