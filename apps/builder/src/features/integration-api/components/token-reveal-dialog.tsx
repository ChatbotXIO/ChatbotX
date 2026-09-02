"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useClipboard } from "@/hooks/use-clipboard"

type TokenRevealDialogProps = {
  token: string | null
  onOpenChange: (open: boolean) => void
}

/** Shows a freshly-generated API token exactly once — it is never persisted or re-derivable after this. */
export function TokenRevealDialog({
  token,
  onOpenChange,
}: TokenRevealDialogProps) {
  const t = useTranslations()
  const { handleCopy } = useClipboard()

  return (
    <Dialog onOpenChange={onOpenChange} open={token !== null}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("fields.api.tokenReveal.title")}</DialogTitle>
          <DialogDescription>
            {t("fields.api.tokenReveal.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input className="font-mono text-sm" readOnly value={token ?? ""} />
          <Button
            onClick={() => token && handleCopy(token)}
            size="icon"
            type="button"
            variant="outline"
          >
            <CopyIcon className="h-4 w-4" />
          </Button>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button">
            {t("fields.api.tokenReveal.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
