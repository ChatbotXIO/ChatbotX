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
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { clientErrorHandler } from "@/lib/errors/client-handler"
import { client } from "@/lib/orpc/orpc"

type CoexistPopupProps = {
  channel: "whatsapp" | "messenger" | "instagram"
  integrationId: string
  workspaceId: string
  onDone: () => void
}

type CoexistPayload = {
  workspaceId: string
  integrationId: string
  enabled: boolean
  aiReadsSyncedHistory: boolean
}

const CHANNEL_DESCRIPTION_KEYS = {
  whatsapp: "coexist.descriptionWhatsapp",
  messenger: "coexist.descriptionMessenger",
  instagram: "coexist.descriptionInstagram",
} as const satisfies Record<CoexistPopupProps["channel"], string>

// The three coexist procedures share the same input/output shape — this map
// replaces a channel === "x" ? ... : channel === "y" ? ... chain (flagged as
// a nested ternary) with a single dispatch. Wrapped in arrow functions
// rather than passed as bare method references — oRPC client procedures can
// rely on their receiver, and a bare reference would drop that binding
// (see AGENTS.md invariant on `.bind`-losing callback references).
const COEXIST_SETTERS = {
  whatsapp: (payload: CoexistPayload) =>
    client.integrationWhatsappAPIs.setCoexistWhatsappAPI(payload),
  messenger: (payload: CoexistPayload) =>
    client.integrationMessengerAPIs.setCoexistMessengerAPI(payload),
  instagram: (payload: CoexistPayload) =>
    client.integrationInstagramAPIs.setCoexistInstagramAPI(payload),
} as const satisfies Record<CoexistPopupProps["channel"], unknown>

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
  // Default OFF: the AI ignores coexist-synced history (the marker advances)
  // unless the user explicitly opts in.
  const [aiReadsSyncedHistory, setAiReadsSyncedHistory] = useState(false)

  const handleChoice = async (enabled: boolean) => {
    setPending(enabled ? "enable" : "decline")
    try {
      const payload = {
        workspaceId,
        integrationId,
        enabled,
        aiReadsSyncedHistory,
      }
      const setCoexist = COEXIST_SETTERS[channel]
      const result = await setCoexist(payload)

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

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Switch
              checked={aiReadsSyncedHistory}
              disabled={isPending}
              onCheckedChange={setAiReadsSyncedHistory}
            />
            <span className="font-medium text-sm">
              {t("coexist.aiReadsSyncedHistoryLabel")}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            {t("coexist.aiReadsSyncedHistoryHelper")}
          </p>
        </div>

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
