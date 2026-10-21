import { ChatbotXException } from "../errors"

/** Why the shop is not taking an order right now. */
export type WebshopClosedReason = "orderingUnavailable" | "outsideOpenHours"

export const webshopClosedException = (
  reason: WebshopClosedReason,
  vendorName?: string,
) => {
  const error = new ChatbotXException(
    reason === "outsideOpenHours"
      ? `${vendorName ? `"${vendorName}"` : "The store"} is closed right now.`
      : "The store is not taking orders right now.",
    "webshopClosed",
  )
  error.data = { reason, ...(vendorName ? { vendorName } : {}) }
  return error
}

export const webshopPreviewException = () =>
  new ChatbotXException(
    "A preview link can browse the shop but not order.",
    "webshopPreviewOnly",
    403,
  )

export const webshopRatingNotAllowedException = () =>
  new ChatbotXException(
    "This order cannot be rated.",
    "webshopRatingNotAllowed",
  )
