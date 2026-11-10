"use client"

import type { MessageWhatsappPaymentMethodEntity } from "@chatbotx.io/sdk"
import { CircleCheckIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

/** Meta's `payment_method` for a one-click (saved card) confirmation. */
const OFFSITE_CARD_PAY = "offsite_card_pay"
const MS_PER_SECOND = 1000

/**
 * Meta's `payment_timestamp` (Unix seconds) as a short local date, or `null`
 * when it is missing or out of range: an absurd but finite value (e.g.
 * `1e300`) overflows to an invalid date, and formatting one throws.
 */
function formatConfirmedAt(
  locale: string,
  paymentTimestamp: number | undefined,
): string | null {
  if (typeof paymentTimestamp !== "number") {
    return null
  }
  const date = new Date(paymentTimestamp * MS_PER_SECOND)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

/**
 * The buyer confirmed a one-click payment in WhatsApp. Meta's webhook only
 * "confirms the buyer's intention to make a payment" and hands over the card
 * credential: nothing is charged yet, so the event says so plainly and never
 * reads as money received. Centered like other conversation events, with the
 * reference the business reconciles against.
 */
export function WhatsappPaymentConfirmation({
  entity,
}: {
  entity: MessageWhatsappPaymentMethodEntity
}) {
  const t = useTranslations("messages.paymentConfirmation")
  const locale = useLocale()
  const isCard = entity.paymentMethod === OFFSITE_CARD_PAY
  const confirmedAt = formatConfirmedAt(locale, entity.paymentTimestamp)

  return (
    <div className="mx-auto flex w-fit max-w-full flex-col items-center gap-1 rounded-xl border border-emerald-600/30 bg-emerald-50 px-4 py-2.5 text-center text-sm dark:border-emerald-400/30 dark:bg-emerald-950/40">
      <span className="flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-300">
        <CircleCheckIcon aria-hidden className="size-4 shrink-0" />
        {isCard ? t("cardTitle") : t("title")}
      </span>
      {entity.lastFourDigits && (
        <span className="text-foreground">
          {t("cardEnding", { lastFourDigits: entity.lastFourDigits })}
        </span>
      )}
      <span className="text-muted-foreground text-xs">{t("notCharged")}</span>
      {(entity.referenceId || confirmedAt) && (
        <span className="text-muted-foreground text-xs">
          {[
            entity.referenceId &&
              t("reference", { referenceId: entity.referenceId }),
            confirmedAt,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
    </div>
  )
}
