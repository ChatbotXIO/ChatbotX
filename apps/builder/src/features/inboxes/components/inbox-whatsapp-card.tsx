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
import { parsePhoneNumberFromString } from "libphonenumber-js"
import { CopyIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import QRCode from "react-qr-code"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import type { InboxResource } from "../schemas/resource"
import { InboxIcon } from "./inbox-icon"

export default function InboxWhatsappCard({ inbox }: { inbox: InboxResource }) {
  const formattedPhoneNumber = useMemo(() => {
    const auth = inbox.integrationWhatsapp?.auth as
      | WhatsappAuthValue
      | undefined
    const phoneNumber = auth?.metadata.phoneNumber.display_phone_number ?? ""

    return (
      parsePhoneNumberFromString(
        phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`,
      )?.number.replace("+", "") ?? ""
    )
  }, [inbox.integrationWhatsapp?.auth])

  return (
    <Card className="py-3" key={inbox.id}>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4">
        <InboxIcon
          iconClassName="size-5"
          inboxType="whatsapp"
          label={inbox.integrationWhatsapp?.name}
        />

        <WhatsappQRCodeDialog displayPhoneNumber={formattedPhoneNumber} />
      </CardContent>
    </Card>
  )
}

function WhatsappQRCodeDialog({
  displayPhoneNumber,
}: {
  displayPhoneNumber: string
}) {
  const t = useTranslations()
  const [, copy] = useCopyToClipboard()

  const wabaUrl = useMemo(
    () => `https://wa.me/${displayPhoneNumber}`,
    [displayPhoneNumber],
  )

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
              rel="noopener noreferrer"
              target="_blank"
            >
              {wabaUrl}
            </Link>
            <Button
              aria-label={t("actions.copy")}
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
