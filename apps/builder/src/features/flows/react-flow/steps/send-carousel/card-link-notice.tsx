"use client"

import { TriangleAlertIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"
import { readDroppedCarouselCardLink } from "./validator"

type CarouselCardLinkNoticeProps = {
  /** Form path of the card, e.g. `steps.0.cards.2`. */
  cardName: string
}

/**
 * Tells the author that WhatsApp will drop this card's link button.
 *
 * Advisory rather than blocking: publish already rejects the shape on a WhatsApp
 * node, but an `omnichannel` node is allowed to keep it because the flow may only
 * ever serve channels where a mixed card is legal. Meta accepts the degraded
 * payload either way, so this notice and the sender's warning log are the only
 * places the loss is ever visible.
 *
 * Watches rather than reads the form so the notice follows the card as buttons
 * are added and removed.
 */
export const CarouselCardLinkNotice = ({
  cardName,
}: CarouselCardLinkNoticeProps) => {
  const t = useTranslations()
  const channel = useWatch({ name: "beforeStep.channel" })
  const buttons = useWatch({ name: `${cardName}.buttons` })

  if (!readDroppedCarouselCardLink({ channel, buttons })) {
    return null
  }

  return (
    <p
      className="mt-1 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-amber-900 text-xs dark:bg-amber-950/40 dark:text-amber-200"
      data-slot="carousel-card-link-notice"
      role="status"
    >
      <TriangleAlertIcon
        aria-hidden="true"
        className="mt-px size-3.5 shrink-0"
      />
      <span>{t("flows.sendCarousel.whatsappLinkButtonIgnored")}</span>
    </p>
  )
}
