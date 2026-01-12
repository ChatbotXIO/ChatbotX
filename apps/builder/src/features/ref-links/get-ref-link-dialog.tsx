"use client"

import { InboxType } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import type { Row } from "@tanstack/react-table"
import { useTranslations } from "next-intl"
import type { ComponentPropsWithoutRef, ReactElement } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { useConfiguredInboxTypeOptions } from "../inboxes/provider/inbox-hook"
import { useInboxStore } from "../inboxes/provider/inbox-store-context"
import { getInboxLink } from "./helpers"
import type { RefLinkResource } from "./schemas/types"

type DeleteRefLinkDialogProps = ComponentPropsWithoutRef<typeof Dialog> & {
  chatbotId: string
  refLink: Row<RefLinkResource>["original"]
  trigger: ReactElement
  onOpenQRCode: (text: string) => void
}

export default function GetRefLinkDialog({
  chatbotId,
  refLink,
  trigger,
  onOpenQRCode,
}: DeleteRefLinkDialogProps) {
  const t = useTranslations()
  const [_, copyToClipboard] = useCopyToClipboard()
  const inboxes = useInboxStore((state) => state.inboxes)
  const channelOptions = useConfiguredInboxTypeOptions()
  const channelOptionsFiltered = channelOptions.filter(
    (option) => option.value !== InboxType.zalo,
  )

  const handleChooseChannel = (inboxType: InboxType) => {
    const link = getInboxLink({
      inboxType,
      inboxes,
      refId: `r_${refLink.id}`,
      chatbotId,
    })
    handleCopy(link)
  }

  const getQRCode = (inboxType: InboxType) => {
    const link = getInboxLink({
      inboxType,
      inboxes,
      refId: `r_${refLink.id}`,
      chatbotId,
    })
    onOpenQRCode(link)
  }

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
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={"max-h-screen max-w-xl overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>{t("actions.getLinkOrQRCode")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {channelOptionsFiltered.map((c) => (
            <div className="flex w-full items-center gap-2" key={c.value}>
              <span className="flex flex-1 gap-2">
                {<c.icon fill={c.iconColor} />}
                {c.label}
              </span>
              <Button
                onClick={() => handleChooseChannel(c.value as InboxType)}
                type="button"
                variant="outline"
              >
                {t("actions.copyLink")}
              </Button>
              <Button
                onClick={() => getQRCode(c.value as InboxType)}
                type="button"
                variant="outline"
              >
                QR Code
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
