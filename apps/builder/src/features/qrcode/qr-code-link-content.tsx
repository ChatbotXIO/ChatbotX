"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { CopyIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import QRCode from "react-qr-code"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"

type QrCodeLinkContentProps = {
  link: string
}

export const QrCodeLinkContent = ({ link }: QrCodeLinkContentProps) => {
  const t = useTranslations()
  const [, copy] = useCopyToClipboard()

  const handleCopy = () => {
    copy(link).then(() => {
      toast.success(t("messages.copiedToClipboard"))
    })
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <p className="text-muted-foreground text-sm">{t("actions.scanQRCode")}</p>
      <QRCode value={link} />

      <p className="text-muted-foreground text-sm">{t("texts.or")}</p>
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
          aria-label={t("actions.copyUrl")}
          onClick={handleCopy}
          size="icon"
          type="button"
          variant="secondary"
        >
          <CopyIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
