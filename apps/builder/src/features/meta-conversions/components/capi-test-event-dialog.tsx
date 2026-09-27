"use client"

import type { MetaConversionsChannel } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  CAPI_TEST_MESSAGING_ID_MAX_LENGTH,
  capiTestMessagingIdSchema,
} from "@chatbotx.io/utils/meta-capi"
import { Loader2Icon, SendIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useId, useState } from "react"

type CapiTestEventDialogProps = {
  channel: MetaConversionsChannel
  open: boolean
  onOpenChange: (open: boolean) => void
  isPending: boolean
  onSend: (messagingId: string) => void
}

/**
 * Asks for the ONE thing "Send test event" cannot know on its own: the
 * person's messaging id for this channel (page-scoped user id, IG-scoped user
 * id, or click-to-WhatsApp click id). Meta's Test events tab hands out sample
 * values, so no stored contact is ever used or attributed to.
 */
export function CapiTestEventDialog({
  channel,
  open,
  onOpenChange,
  isPending,
  onSend,
}: CapiTestEventDialogProps) {
  const t = useTranslations("metaConversions")
  const inputId = useId()
  const [draft, setDraft] = useState("")
  // Start every opening from a blank id, whichever side closed the dialog
  // (Cancel, a successful send, or the parent) — adjust-state-on-prop-change
  // rather than an effect, so the reset lands in the same render.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft("")
    }
  }

  // The exact server rule (`capiTestMessagingIdSchema`), so the dialog never
  // submits a value the business layer would bounce.
  const parsed = capiTestMessagingIdSchema.safeParse(draft)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("testEvents.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("testEvents.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (parsed.success) {
              onSend(parsed.data)
            }
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>
              {t(`testEvents.messagingIdLabel.${channel}`)}
            </Label>
            <Input
              autoComplete="off"
              className="font-mono"
              id={inputId}
              maxLength={CAPI_TEST_MESSAGING_ID_MAX_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("testEvents.messagingIdPlaceholder")}
              value={draft}
            />
            <p className="text-muted-foreground text-xs">
              {t("testEvents.messagingIdHint")}
            </p>
          </div>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  {t("testEvents.cancel")}
                </Button>
              }
            />
            <Button disabled={isPending || !parsed.success} type="submit">
              {isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <SendIcon />
              )}
              {t("testEvents.confirmSend")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
