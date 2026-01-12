"use client"

import { InboxType } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { SiZalo, SiZaloHex } from "@icons-pack/react-simple-icons"
import { CopyIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import QRCode from "react-qr-code"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { getInboxLink } from "@/features/ref-links/helpers"
import type { InboxResource } from "../schemas/resource"

export default function InboxZaloCard({
  inbox,
  actionLabel,
}: {
  inbox: InboxResource
  actionLabel?: string
}) {
  const link = getInboxLink({
    inboxType: InboxType.zalo,
    inboxes: [inbox],
    chatbotId: inbox.chatbotId,
  })
  return (
    <Card className="py-3" key={inbox.id}>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
        <SiZalo aria-hidden="true" className="size-5" fill={SiZaloHex} />
        <p className="flex-1 truncate text-sm">{inbox.integrationZalo?.name}</p>
        <ZaloQRCodeDiaglog actionLabel={actionLabel} link={link} />
      </CardContent>
    </Card>
  )
}

function ZaloQRCodeDiaglog({
  link,
  actionLabel,
}: {
  link: string
  actionLabel?: string
}) {
  const t = useTranslations()
  const [_, copy] = useCopyToClipboard()

  const handleCopy = () => {
    copy(link).then(() => {
      toast.success(t("messages.copiedToClipboard"))
    })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="secondary">
          {actionLabel ?? t("actions.testNow")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("actions.connectFeature", {
              feature: t("fields.whatsapp.label"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex flex-col items-center justify-center gap-2">
          <p>{t("actions.scanQRCode")}</p>
          <QRCode value={link} />

          <p>{t("texts.or")}</p>
          <div className="-mt-2 flex items-center justify-center gap-2">
            <Link
              className="text-sky-600 no-underline hover:underline dark:text-sky-400"
              href={link}
            >
              {link}
            </Link>
            <Button
              onClick={handleCopy}
              size="icon"
              type="button"
              variant="secondary"
            >
              <CopyIcon className="size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
