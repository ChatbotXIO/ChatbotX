"use client"

import { Avatar, AvatarFallback } from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PhoneIcon, PhoneOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export type WhatsappIncomingCallCardProps = {
  contactName: string
  /**
   * Translation key for the status line under the contact name —
   * whatsapp.calls.incomingCall for a fresh basket entry, or
   * whatsapp.calls.voipConnecting for the slot's call once the agent clicks
   * Answer and it moves to phase: "answering". Passed in rather than hardcoded
   * so this one component covers both.
   */
  statusKey: string
  secondsRemaining: number
  /**
   * Disables both buttons while an answer/replacement attempt for this exact
   * call is already in flight — mirrors answeringIdRef in useWhatsappVoipCall.
   */
  disabled?: boolean
  onAnswer: () => void
  onReject: () => void
}

/**
 * The big green incoming-call card: avatar, name, status, countdown,
 * Answer/Reject. Shared between the single call slot and a single basket entry
 * rendered directly from ringingCalls when the slot is free — never duplicate
 * this markup for either caller.
 */
export function WhatsappIncomingCallCard({
  contactName,
  statusKey,
  secondsRemaining,
  disabled = false,
  onAnswer,
  onReject,
}: WhatsappIncomingCallCardProps) {
  const t = useTranslations()
  const initials = contactName.slice(0, 2)

  return (
    <>
      <div className="flex flex-col items-center gap-2 px-6 pt-2 pb-4 text-center">
        <span className="font-medium text-emerald-100 text-xs uppercase tracking-widest">
          {t("whatsapp.calls.panel.eyebrowIncoming")}
        </span>
        <Avatar className="size-24 border-4 border-white/30 shadow-lg motion-safe:animate-pulse">
          <AvatarFallback className="bg-emerald-950 text-3xl text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="text-2xl text-white">{contactName}</span>
        {/* aria-live on the status text only — the countdown below ticks
         * every 250ms and must never be re-announced that often. */}
        <span aria-live="polite" className="text-emerald-100">
          {t(statusKey)}
        </span>
        <span className="text-emerald-200 text-xs tabular-nums">
          {t("whatsapp.calls.ringingCountdown", { seconds: secondsRemaining })}
        </span>
      </div>
      <div className="flex items-center justify-center gap-8 px-6 pb-8">
        <div className="flex flex-col items-center gap-2">
          <Button
            aria-label={t("whatsapp.calls.reject")}
            className="size-16 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 disabled:opacity-70"
            disabled={disabled}
            onClick={onReject}
            size="icon"
            type="button"
          >
            <PhoneOffIcon className="size-6" />
          </Button>
          <span className="text-emerald-100 text-xs">
            {t("whatsapp.calls.reject")}
          </span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button
            aria-label={t("whatsapp.calls.answer")}
            className="size-16 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 disabled:opacity-70"
            disabled={disabled}
            onClick={onAnswer}
            size="icon"
            type="button"
          >
            <PhoneIcon className="size-6" />
          </Button>
          <span className="text-emerald-100 text-xs">
            {t("whatsapp.calls.answer")}
          </span>
        </div>
      </div>
    </>
  )
}
