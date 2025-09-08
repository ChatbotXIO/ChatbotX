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
import { Textarea } from "@aha.chat/ui/components/ui/textarea"
import { CopyIcon } from "lucide-react"
import { useState } from "react"

type EmbedCodeDialogProps = {
  webchat: IntegrationWebchatModel
  children: React.ReactNode
}

export function EmbedCodeDialog({ webchat, children }: EmbedCodeDialogProps) {
  const [copied, setCopied] = useState(false)
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "")

  const embedCode = `<!-- Aha Chat Widget -->
<script>
  window.AhaChatConfig = {
    // Optional: Override default settings
    // brandColor: '#${webchat.brandColor.replace("#", "")}',
    // hideHeader: ${webchat.hideHeader},
    // showLogo: ${webchat.showLogo},
    // hideMessageInput: ${webchat.hideMessageInput}
  };
</script>
<script src="${baseUrl}/api/webchat/embed/${webchat.id}"></script>`

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(embedCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea")
      textArea.value = embedCode
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Embed Code</DialogTitle>
          <DialogDescription>
            Copy and paste this code into your website to embed the chat widget.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="embed-url">Embed URL</Label>
            <Input
              className="font-mono text-sm"
              id="embed-url"
              readOnly
              value={`${baseUrl}/api/webchat/embed/${webchat.id}`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="embed-code">Embed Code</Label>
              <Button
                className="gap-2"
                onClick={copyToClipboard}
                size="sm"
                variant="outline"
              >
                <CopyIcon className="h-4 w-4" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <Textarea
              className="resize-none font-mono text-sm"
              id="embed-code"
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
              This widget will only work on domains that are authorized in your
              webchat configuration. Make sure to add your domain to the
              authorized domains list.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
