"use client"

import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
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
import { SiWhatsapp, SiWhatsappHex } from "@icons-pack/react-simple-icons"
import { CopyIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import QRCode from "react-qr-code"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import type { InboxResource } from "../schemas"

export default function InboxWhatsappCard({ inbox }: { inbox: InboxResource }) {
  return (
    <Card className="py-3" key={inbox.id}>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
        <SiWhatsapp
          aria-hidden="true"
          className="size-5"
          fill={SiWhatsappHex}
        />
        <p className="flex-1 truncate text-sm">
          {inbox.integrationWhatsapp?.name}
        </p>
        <WhastappQRCodeDiaglog
          displayPhoneNumber={
            (inbox.integrationWhatsapp?.auth as WhatsappAuthValue).metadata
              .phoneNumber.display_phone_number ?? ""
          }
        />
      </CardContent>
    </Card>
  )
}

function WhastappQRCodeDiaglog({
  displayPhoneNumber,
}: {
  displayPhoneNumber: string
}) {
  const t = useTranslations()
  const [_, copy] = useCopyToClipboard()

  const [wabaUrl, setWabaUrl] = useState<string>("")

  useEffect(() => {
    setWabaUrl(`https://wa.me/${displayPhoneNumber}`)
  }, [displayPhoneNumber])

  const handleCopy = () => {
    copy(wabaUrl).then(() => {
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
          <QRCode value={wabaUrl} />

          <p>{t("texts.or")}</p>
          <div className="-mt-2 flex items-center justify-center gap-2">
            <Link
              className="text-sky-600 no-underline hover:underline dark:text-sky-400"
              href={wabaUrl}
            >
              {wabaUrl}
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
