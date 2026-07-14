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
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { CopyIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { useClipboard } from "@/hooks/use-clipboard"
import { regenerateWebchatIdentitySecretAction } from "../actions/regenerate-webchat-identity-secret.action"

type IdentitySecretFieldProps = {
  workspaceId: string
  webchatId: string
  hasSecret: boolean
}

export default function IdentitySecretField({
  workspaceId,
  webchatId,
  hasSecret,
}: IdentitySecretFieldProps) {
  const t = useTranslations("webchat.identitySecret")
  const { handleCopy } = useClipboard()
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)

  const { execute, isExecuting } = useAction(
    regenerateWebchatIdentitySecretAction.bind(null, workspaceId, webchatId),
    {
      onSuccess: ({ data }) => {
        if (data?.identitySecret) {
          setRevealedSecret(data.identitySecret)
        }
      },
      onError: ({ error }) => {
        toast.error(error.serverError || t("generate"))
      },
    },
  )

  const isConfigured = hasSecret || Boolean(revealedSecret)

  return (
    <div className="space-y-2">
      <Label>{t("title")}</Label>
      <p className="text-muted-foreground text-sm">{t("description")}</p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {isConfigured ? t("configured") : t("notConfigured")}
        </span>
        <Button
          disabled={isExecuting || !webchatId}
          onClick={() => execute()}
          size="sm"
          type="button"
          variant="outline"
        >
          {isExecuting && <Loader2Icon className="h-4 w-4 animate-spin" />}
          {isConfigured ? t("regenerate") : t("generate")}
        </Button>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setRevealedSecret(null)
          }
        }}
        open={Boolean(revealedSecret)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("generatedOnce")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm">
              {revealedSecret}
            </code>
            <Button
              aria-label={t("title")}
              onClick={() => revealedSecret && handleCopy(revealedSecret)}
              size="icon"
              type="button"
              variant="outline"
            >
              <CopyIcon className="size-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setRevealedSecret(null)}
              type="button"
              variant="secondary"
            >
              {t("done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
