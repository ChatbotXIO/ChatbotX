"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useClipboard } from "@/hooks/use-clipboard"

export function MessengerAdPayloadDialog({
  flowId,
  open,
  onOpenChange,
}: {
  flowId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()

  const onCopy = async () => {
    const copied = await handleCopy(flowId)
    if (copied) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("actions.getMessengerAdPayload")}</DialogTitle>
        </DialogHeader>

        <Input className="font-mono" readOnly value={flowId} />

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {t("actions.cancel")}
          </Button>
          <Button onClick={onCopy}>
            <CopyIcon className="h-4 w-4" />
            {t("actions.copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
