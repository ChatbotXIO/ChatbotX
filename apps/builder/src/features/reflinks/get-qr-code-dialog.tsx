"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from "@aha.chat/ui/components/ui/dialog"
import { Input } from "@aha.chat/ui/components/ui/input"
import { Label } from "@aha.chat/ui/components/ui/label"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { type ComponentPropsWithoutRef, useState } from "react"

type GetQRCodeDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  text: string | null
}

export function GetQRCodeDialog({ text, ...props }: GetQRCodeDialogProps) {
  const t = useTranslations()
  const [size, setSize] = useState(600)

  const qrCodeLink = text
    ? `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`
    : ""

  const onDownload = () => {
    if (qrCodeLink) {
      window.open(qrCodeLink, "_blank")
    }
  }

  return (
    <Dialog {...props}>
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>QR Code</DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>{t("fields.imageSize.label")}</Label>
            <Input
              aria-valuemax={1000}
              aria-valuemin={100}
              inputMode="numeric"
              max={1000}
              min={100}
              onChange={(event) => {
                setSize(Number((event.target as HTMLInputElement).value))
              }}
              pattern="[0-9]*"
              type="number"
              value={size}
            />
          </div>

          {text && (
            <div className="flex justify-center p-4">
              <Image
                alt="QR Code"
                height={200}
                src={qrCodeLink}
                unoptimized
                width={200}
              />
            </div>
          )}
        </div>
        <Button onClick={onDownload} size="sm" type="button">
          {t("actions.download")}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
