import { Button } from "@aha.chat/ui/components/ui/button"
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
import { useState } from "react"
import QRCode from "react-qr-code"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"

export function ScanQRCodeDialog({
  title,
  triggerName,
  link,
}: {
  title: string
  triggerName: string
  link: string
}) {
  const t = useTranslations()
  const [_, copy] = useCopyToClipboard()
  const [open, setOpen] = useState(false)

  const handleCopy = () => {
    copy(link).then(() => {
      toast.success(t("messages.copiedToClipboard"))
    })
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          {triggerName}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <div className="flex flex-col items-center justify-center gap-2">
          <p>{t("actions.scanQRCode")}</p>
          <QRCode value={link} />

          <p>{t("texts.or")}</p>
          <div className="-mt-2 flex items-center justify-center gap-2">
            <Link
              className="block max-w-[300px] truncate text-sky-600 no-underline hover:underline dark:text-sky-400"
              href={link}
              rel="noopener noreferrer"
              target="_blank"
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
