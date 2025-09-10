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
import { Input } from "@aha.chat/ui/components/ui/input"
import { Label } from "@aha.chat/ui/components/ui/label"
import { ScrollArea } from "@aha.chat/ui/components/ui/scroll-area"
import { Textarea } from "@aha.chat/ui/components/ui/textarea"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { env } from "@/env"

type EmbedCodeDialogProps = {
  webchat: IntegrationWebchatModel
  children: React.ReactNode
}

export function EmbedCodeDialog({ webchat, children }: EmbedCodeDialogProps) {
  const t = useTranslations()

  const baseURL = typeof window !== "undefined" ? window.location.origin : ""
  const embedURL = `${baseURL}/webchat?chatbotId=${webchat.chatbotId}&webchatId=${webchat.id}`

  const embedCode = `<!-- Aha Chat Widget -->
<script>
  <Script
    onLoad={() => {
      window.ahachatWidget.init({
        chatbotId: "${webchat.chatbotId}",
        webchatId: "${webchat.id}",
        hideHeader: ${webchat.hideHeader},
        showLogo: ${webchat.showLogo},
        hideMessageInput: ${webchat.hideMessageInput},
        brandColor: "${webchat.brandColor}",
      })
    }}
    src="${env.NEXT_PUBLIC_BUILDER_URL}/api/webchat/plugin.js"
  />
</script>`

  const [_, setCopiedEmbedCode] = useCopyToClipboard()

  const copyToClipboard = async (text: string) => {
    console.log("copyToClipboard", text)
    try {
      await setCopiedEmbedCode(text)
      toast.success(t("messages.copiedToClipboard"))
      // biome-ignore lint/suspicious/noEmptyBlockStatements: wip
    } catch {}
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("embedCode.title")}</DialogTitle>
          <DialogDescription>{t("embedCode.description")}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] max-h-[500px]">
          <div className="space-y-4 pr-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="embedURL">{t("fields.url.label")}</Label>
                <Button
                  className="gap-2"
                  onClick={() => copyToClipboard(embedURL)}
                  size="sm"
                  variant="outline"
                >
                  <CopyIcon className="h-4 w-4" />
                </Button>
              </div>
              <Input
                className="font-mono text-sm"
                id="embedURL"
                readOnly
                value={`${baseURL}/api/webchat/embed/${webchat.id}`}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="embedCode">{t("embedCode.title")}</Label>
                <Button
                  className="gap-2"
                  onClick={() => copyToClipboard(embedCode)}
                  size="sm"
                  variant="outline"
                >
                  <CopyIcon className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                className="resize-none font-mono text-sm"
                id="embedCode"
                readOnly
                rows={8}
                value={embedCode}
              />
            </div>

            <div className="rounded-lg bg-muted p-4">
              <h4 className="mb-2 font-medium">Configuration Options</h4>
              <p className="mb-2 text-muted-foreground text-sm">
                You can customize the widget by setting these options in the
                AhaChatConfig object:
              </p>
              <ul className="space-y-1 text-muted-foreground text-sm">
                <li>
                  • <code>brandColor</code> - Override the brand color (hex
                  format)
                </li>
                <li>
                  • <code>hideHeader</code> - Show/hide the header (boolean)
                </li>
                <li>
                  • <code>showLogo</code> - Show/hide personal logo (boolean)
                </li>
                <li>
                  • <code>hideMessageInput</code> - Show/hide message input
                  (boolean)
                </li>
              </ul>
            </div>

            <div className="rounded-lg bg-blue-50 p-4">
              <h4 className="mb-2 font-medium text-blue-900">Security Note</h4>
              <p className="text-blue-800 text-sm">
                This widget will only work on domains that are authorized in
                your webchat configuration. Make sure to add your domain to the
                authorized domains list.
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
