"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { RefObject } from "react"
import { useState } from "react"
import { toast } from "sonner"
import { setCoexist } from "../lib/coexist-client"
import { type CoexistRowResult, summarizeCoexistRun } from "../lib/coexist-run"
import {
  CONNECT_CHANNEL_REGISTRY,
  type ConnectPickerChannel,
} from "../lib/registry"

/** The one account the coexist popup can enable syncing for. */
export type CoexistFlowTarget = { integrationId: string; name: string }

export type CoexistStepProps = {
  channel: ConnectPickerChannel
  workspaceId: string
  target: CoexistFlowTarget
  onDone: () => void
  /** For the step-change focus effect the caller drives. Not focused automatically here. */
  titleRef?: RefObject<HTMLHeadingElement | null>
}

/**
 * The coexist opt-in popup for WhatsApp's direct/manual connect path
 * (`CoexistPopup` ← `whatsapp-create.tsx`'s `directCoexist`), which always
 * has exactly one target: the channel's description, the billing note, one
 * "AI reads synced history" switch (default OFF) and two explicit actions —
 * Decline POSTs `enabled:false`, Enable POSTs `enabled:true`. The
 * multi-select pickers do NOT come through here: their coexist opt-in is a
 * per-row switch in the picker itself, run per row right after that row
 * connects (`useCoexistSelection`, `useConnectBatch`).
 */
export function CoexistStep({
  channel,
  workspaceId,
  target,
  onDone,
  titleRef,
}: CoexistStepProps) {
  const t = useTranslations()
  // Default OFF: the AI ignores coexist-synced history (the marker advances)
  // unless the user explicitly opts in.
  const [aiReadsSyncedHistory, setAiReadsSyncedHistory] = useState(false)
  const [pending, setPending] = useState<"enable" | "decline" | null>(null)

  const handleChoice = async (enabled: boolean) => {
    setPending(enabled ? "enable" : "decline")

    // One implementation of the endpoint, body and failure precedence for
    // every coexist caller (`lib/coexist-client.ts`) — this step, the batch
    // runner and the single-item flow cannot drift apart.
    const result = await setCoexist({
      workspaceId,
      channel,
      integrationId: target.integrationId,
      enabled,
      aiReadsSyncedHistory,
      t,
    })

    setPending(null)

    // A network/HTTP-level failure was already toasted by `clientErrorHandler`
    // inside the client — never announce the same failure twice.
    if (!(result.ok || result.reported)) {
      toast.error(result.text)
    }

    const row: CoexistRowResult = result.ok
      ? { status: "done" }
      : { status: "error", text: result.text }

    switch (summarizeCoexistRun([row], { anyEnabled: enabled })) {
      case "disabled": {
        toast.success(t("coexist.success.disabled"))
        break
      }
      case "enabled": {
        toast.success(t("coexist.success.enabled"))
        break
      }
      default: {
        break
      }
    }

    onDone()
  }

  const isPending = pending !== null

  return (
    <>
      <DialogHeader>
        <DialogTitle className="mb-4" ref={titleRef} tabIndex={-1}>
          {t("coexist.title")}
        </DialogTitle>
        <DialogDescription>
          {t(CONNECT_CHANNEL_REGISTRY[channel].coexistDescriptionKey)}
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
    </>
  )
}
