"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@aha.chat/ui/components/ui/dialog"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { InboxIcon } from "../inboxes/components/inbox-icon"
import { useInboxStore } from "../inboxes/provider/inbox-store-context"
import { ScanQRCodeDialog } from "../qrcode/scan-qrcode"
import { getInboxLink } from "./helpers"
import type { ReflinkResource } from "./schemas/resource"

type GetReflinkDialogProps = {
  reflink: ReflinkResource | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GetReflinksDialog({
  reflink,
  open,
  onOpenChange,
}: GetReflinkDialogProps) {
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>{t("actions.copyUrl")}</DialogTitle>
        </DialogHeader>

        {reflink ? <GetReflinksList reflinkData={reflink.name} /> : null}
      </DialogContent>
    </Dialog>
  )
}

export function GetReflinksList({ reflinkData }: { reflinkData: string }) {
  const t = useTranslations()
  const [_, copyToClipboard] = useCopyToClipboard()

  const { inboxes } = useInboxStore((state) => state)

  const handleCopy = (text: string) => {
    copyToClipboard(text)
      .then(() => {
        toast.success(t("messages.copiedToClipboard"))
      })
      .catch(() => {
        toast.error(t("messages.failedToCopy"))
      })
  }

  return (
    <div className="flex flex-col">
      {inboxes.map((inbox) => {
        const link = getInboxLink({ inbox, reflinkData })

        return (
          <div
            className="flex w-full items-center gap-2 border-t py-4"
            key={inbox.id}
          >
            <div className="flex flex-1 flex-col gap-1">
              <InboxIcon channel={inbox.channel} size="large" />
              <div className="text-muted-foreground text-xs">{inbox.name}</div>
            </div>
            <Button
              onClick={() => handleCopy(link)}
              size="sm"
              variant="outline"
            >
              {t("actions.copyUrl")}
            </Button>

            <ScanQRCodeDialog
              link={link}
              title={"Scan QR Code to connect to the inbox"}
              triggerName={t("actions.qrCode")}
            />
          </div>
        )
      })}
    </div>
  )
}
