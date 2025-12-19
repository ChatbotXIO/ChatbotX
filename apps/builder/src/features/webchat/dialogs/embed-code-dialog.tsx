"use client"

import type { IntegrationWebchatModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Label } from "@aha.chat/ui/components/ui/label"
import { Textarea } from "@aha.chat/ui/components/ui/textarea"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"

type EmbedCodeDialogProps = {
  webchat: IntegrationWebchatModel
  children: React.ReactNode
}

export function EmbedCodeDialog({ webchat, children }: EmbedCodeDialogProps) {
  const [_, copyToClipboard] = useCopyToClipboard()
  const t = useTranslations()

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "")

  const embedCode = `<!-- Aha Chat Widget -->
<script src="${baseUrl}/chat-widget/plugin.js" crossorigin="anonymous" async
  type="module" onload="window.csmChatWidget?.init({
    webchatId: '${webchat.id}',
    chatbotId: '${webchat.chatbotId}',
    brandColor: '${webchat.brandColor}',
    hideHeader: ${webchat.hideHeader},
    showLogo: ${webchat.showLogo},
    hideMessageInput: true
  });"></script>`

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
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("fields.embedCode.label")}</DialogTitle>
          <DialogDescription>
            {t("fields.embedCode.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="embed-code">{t("fields.embedCode.label")}</Label>
              <Button
                className="gap-2"
                onClick={() => handleCopy(embedCode)}
                size="icon"
                variant="outline"
              >
                <CopyIcon className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              className="resize-none font-mono text-sm focus-visible:outline-none focus-visible:ring-0"
              id="embed-code"
              readOnly
              rows={8}
              value={embedCode}
            />
          </div>

          <div className="rounded-lg bg-blue-50 p-4">
            <h4 className="mb-2 font-medium text-blue-900">
              {t("fields.embedCode.securityNote")}
            </h4>
            <p className="text-blue-800 text-sm">
              {t("fields.embedCode.securityNoteDescription")}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
