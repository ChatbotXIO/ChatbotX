"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"
import { QrCodeLinkContent } from "@/features/qrcode/qr-code-link-content"

type MagicLinkQrDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  publicUrl: string | null
}

export const MagicLinkQrDialog = ({
  open,
  onOpenChange,
  publicUrl,
}: MagicLinkQrDialogProps) => {
  const t = useTranslations()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("QRCode.title")}</DialogTitle>
          <DialogDescription>{t("QRCode.description")}</DialogDescription>
        </DialogHeader>
        {publicUrl ? <QrCodeLinkContent link={publicUrl} /> : null}
      </DialogContent>
    </Dialog>
  )
}
