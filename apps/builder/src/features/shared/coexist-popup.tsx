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
import ky from "ky"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import type { SetCoexistInstagramResponse } from "@/features/integration-instagram/api/coexist"
import type { SetCoexistMessengerResponse } from "@/features/integration-messenger/api/coexist"
import type { SetCoexistWhatsappResponse } from "@/features/integration-whatsapp/api/coexist"
import { clientErrorHandler } from "@/lib/errors/client-handler"

type CoexistPopupProps = {
  channel: "whatsapp" | "messenger" | "instagram"
  integrationId: string
  workspaceId: string
  onDone: () => void
}

type CoexistResponse =
  | SetCoexistWhatsappResponse
  | SetCoexistMessengerResponse
  | SetCoexistInstagramResponse

const CHANNEL_DESCRIPTION_KEYS = {
  whatsapp: "coexist.descriptionWhatsapp",
  messenger: "coexist.descriptionMessenger",
  instagram: "coexist.descriptionInstagram",
} as const satisfies Record<CoexistPopupProps["channel"], string>

const KNOWN_REASONS = [
  "already_triggered",
  "window_expired",
  "not_eligible",
  "trigger_failed",
] as const

type KnownReason = (typeof KNOWN_REASONS)[number]

const REASON_TO_KEY: Record<KnownReason, string> = {
  already_triggered: "coexist.errors.alreadyTriggered",
  window_expired: "coexist.errors.windowExpired",
  not_eligible: "coexist.errors.notEligible",
  trigger_failed: "coexist.errors.triggerFailed",
}

function isKnownReason(reason: string): reason is KnownReason {
  return (KNOWN_REASONS as readonly string[]).includes(reason)
}

export function CoexistPopup({
  channel,
  integrationId,
  workspaceId,
  onDone,
}: CoexistPopupProps) {
  const t = useTranslations()
  const [pending, setPending] = useState<"enable" | "decline" | null>(null)

  const handleChoice = async (enabled: boolean) => {
    setPending(enabled ? "enable" : "decline")
    try {
      const endpoint = `/api/workspaces/${workspaceId}/integrations/${channel}/${integrationId}/coexist`
      const result = await ky
        .post<CoexistResponse>(endpoint, {
          json: { workspaceId, integrationId, enabled },
        })
        .json()

      setPending(null)

      if (result.success) {
        toast.success(
          t(enabled ? "coexist.success.enabled" : "coexist.success.disabled"),
        )
      } else if (result.msg) {
        toast.error(result.msg)
      } else {
        const reason = result.reason
        const messageKey =
          reason && isKnownReason(reason)
            ? REASON_TO_KEY[reason]
            : "coexist.errors.unknown"

        toast.error(t(messageKey))
      }
    } catch (error) {
      await clientErrorHandler(error)
      setPending(null)
    }

    onDone()
  }

  const isPending = pending !== null

  return (
    <Dialog
      onOpenChange={(isOpen, eventDetails) => {
        if (!isOpen) {
          // Mandatory billing gate — user must pick explicitly, cannot dismiss.
          eventDetails.cancel()
        }
      }}
      open
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="mb-4">{t("coexist.title")}</DialogTitle>
          <DialogDescription>
            {t(CHANNEL_DESCRIPTION_KEYS[channel])}
          </DialogDescription>
        </DialogHeader>

        <p className="text-muted-foreground text-xs">
          {t("coexist.billingNote")}
        </p>

        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => handleChoice(false)}
            variant="outline"
          >
            {pending === "decline" && <Loader2Icon className="animate-spin" />}
            {t("coexist.decline")}
          </Button>
          <Button disabled={isPending} onClick={() => handleChoice(true)}>
            {pending === "enable" && <Loader2Icon className="animate-spin" />}
            {t("coexist.enable")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
