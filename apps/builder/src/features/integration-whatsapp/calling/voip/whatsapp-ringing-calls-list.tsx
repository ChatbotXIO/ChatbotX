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
 * Compact strip/card listing every offer currently in the basket
 * (`ringingCalls`) — one row per caller, each with its own independent
 * countdown (`useCountdownSeconds`, never a second copy of that hook). See
 * the UI table in the multi-ring design spec (Workstream 4). Renders
 * nothing when the basket is empty — callers still decide whether THEY
 * should render at all (e.g. the panel picks the single big card instead
 * for exactly one offer with a free slot), this component only knows how to
 * draw a list.
 *
 * Deliberately renders NO backdrop and NO positioning of its own. It used to
 * render its own `VoipBackdrop` when the slot was free, which put a
 * viewport-wide `fixed z-40` overlay INSIDE the caller's positioned
 * `z-50` wrapper: that wrapper is a stacking context, `z-index` applies only
 * to positioned elements, and this card has no position class — so the
 * backdrop painted OVER the list and, having no `pointer-events-none`,
 * swallowed every Answer/Reject click in the one scenario this whole
 * component exists for. The backdrop is the caller's decision and the
 * caller's sibling now, which makes that class of bug unrepresentable here.
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
