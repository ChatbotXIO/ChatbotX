"use client"

import { Avatar, AvatarFallback } from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PhoneIcon, PhoneOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCountdownSeconds } from "./use-countdown-seconds"
import type { WhatsappVoipRingingCall } from "./voip-call-store"

export type WhatsappRingingCallsListProps = {
  calls: WhatsappVoipRingingCall[]
  onAnswer: (whatsappCallId: string) => void
  onReject: (whatsappCallId: string) => void
}

function RingingCallRow({
  call,
  onAnswer,
  onReject,
}: {
  call: WhatsappVoipRingingCall
  onAnswer: () => void
  onReject: () => void
}) {
  const t = useTranslations()
  const secondsRemaining = useCountdownSeconds(call.deadlineAt)
  const contactName = call.contactName ?? t("whatsapp.calls.unknownCaller")

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Avatar className="size-8 shrink-0 border-2 border-white/30">
        <AvatarFallback className="bg-emerald-950 text-white text-xs">
          {contactName.slice(0, 2)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm text-white">{contactName}</div>
        <div className="text-emerald-200 text-xs tabular-nums">
          {t("whatsapp.calls.ringingCountdown", { seconds: secondsRemaining })}
        </div>
      </div>
      <Button
        aria-label={t("whatsapp.calls.rejectCaller", { name: contactName })}
        className="size-8 shrink-0 rounded-full bg-red-600 text-white hover:bg-red-700"
        onClick={onReject}
        size="icon"
        type="button"
      >
        <PhoneOffIcon className="size-3.5" />
      </Button>
      <Button
        aria-label={t("whatsapp.calls.answerCaller", { name: contactName })}
        className="size-8 shrink-0 rounded-full bg-green-600 text-white hover:bg-green-700"
        onClick={onAnswer}
        size="icon"
        type="button"
      >
        <PhoneIcon className="size-3.5" />
      </Button>
    </div>
  )
}

/**
 * Lists every offer currently in the basket, one row per caller. Deliberately
 * renders no backdrop or positioning of its own — a fixed overlay here would
 * paint over the list and swallow Answer/Reject clicks; the backdrop is the
 * caller's sibling instead.
 */
export function WhatsappRingingCallsList({
  calls,
  onAnswer,
  onReject,
}: WhatsappRingingCallsListProps) {
  const t = useTranslations()

  if (calls.length === 0) {
    return null
  }

  return (
    <section
      aria-label={t("whatsapp.calls.panel.ringingListTitle", {
        count: calls.length,
      })}
      className="motion-safe:zoom-in-95 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-none bg-gradient-to-b from-emerald-600 to-emerald-900 text-white shadow-2xl motion-safe:animate-in dark:from-emerald-700 dark:to-emerald-950"
      data-testid="whatsapp-ringing-calls-list"
    >
      <div
        aria-live="polite"
        className="px-3 pt-3 pb-1 font-medium text-emerald-100 text-xs uppercase tracking-widest"
      >
        {t("whatsapp.calls.panel.ringingListTitle", { count: calls.length })}
      </div>
      <div className="max-h-64 divide-y divide-white/10 overflow-y-auto">
        {calls.map((call) => (
          <RingingCallRow
            call={call}
            key={call.whatsappCallId}
            onAnswer={() => onAnswer(call.whatsappCallId)}
            onReject={() => onReject(call.whatsappCallId)}
          />
        ))}
      </div>
    </section>
  )
}
