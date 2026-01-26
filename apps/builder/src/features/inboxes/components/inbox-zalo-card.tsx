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
import { CopyIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import QRCode from "react-qr-code"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import type { InboxResource } from "../schemas/resource"
import { InboxIcon } from "./inbox-icon"

export default function InboxZaloCard({ inbox }: { inbox: InboxResource }) {
  return (
    <Card className="py-3" key={inbox.id}>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
        <InboxIcon
          inboxType={InboxType.zalo}
          label={inbox.integrationZalo?.name}
        />
        <ZaloQRCodeDiaglog oaId={inbox.integrationZalo?.oaId ?? ""} />
      </CardContent>
    </Card>
  )
}

function ZaloQRCodeDiaglog({ oaId }: { oaId: string }) {
  const t = useTranslations()
  const [_, copy] = useCopyToClipboard()

  const [zaloUrl, setZaloUrl] = useState<string>("")

  useEffect(() => {
    setZaloUrl(`https://zalo.me/${oaId}`)
  }, [oaId])

  const handleCopy = () => {
    copy(zaloUrl).then(() => {
      toast.success(t("messages.copiedToClipboard"))
    })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="secondary">
          {t("actions.testNow")}
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
          <QRCode value={zaloUrl} />

          <p>{t("texts.or")}</p>
          <div className="-mt-2 flex items-center justify-center gap-2">
            <Link
              className="text-sky-600 no-underline hover:underline dark:text-sky-400"
              href={zaloUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {zaloUrl}
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
