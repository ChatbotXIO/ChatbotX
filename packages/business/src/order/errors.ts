import type { OrderStatus } from "@chatbotx.io/database/partials"
import { ChatbotXException } from "../errors"

export const orderEmptyException = () =>
  new ChatbotXException("An order needs at least one item.", "orderEmpty")

export const orderingUnavailableException = () =>
  new ChatbotXException(
    "The store is not taking orders right now.",
    "orderingUnavailable",
  )

export const orderProductUnavailableException = (detail: string) =>
  new ChatbotXException(detail, "orderProductUnavailable")

export const orderOutOfStockException = (productName: string) => {
  const error = new ChatbotXException(
    `Not enough stock for "${productName}".`,
    "orderOutOfStock",
  )
  error.data = { productName }
  return error
}

export const orderBelowMinimumException = (minimum: number) => {
  const error = new ChatbotXException(
    `The order total is below the store minimum of ${minimum}.`,
    "orderBelowMinimum",
  )
  error.data = { minimum }
  return error
}

export const orderInvalidStatusTransitionException = (
  from: OrderStatus,
  to: OrderStatus,
) => {
  const error = new ChatbotXException(
    `An order that is ${from} cannot become ${to}.`,
    "orderInvalidStatusTransition",
    409,
  )
  error.data = { from, to }
  return error
}

export const orderBelowVendorMinimumException = (
  vendorName: string,
  minimum: number,
) => {
  const error = new ChatbotXException(
    `The items from "${vendorName}" are below its minimum order of ${minimum}.`,
    "orderBelowVendorMinimum",
  )
  error.data = { vendorName, minimum }
  return error
}

/** An online order is accepted only once its payment came in. */
export const orderAwaitingPaymentException = () =>
  new ChatbotXException(
    "The order is waiting for its online payment.",
    "orderAwaitingPayment",
    409,
  )

/** The payment could not be sent back, so the order stays as it was. */
export const orderRefundFailedException = (provider: string) => {
  const error = new ChatbotXException(
    `${provider} could not refund the payment, so the order was not cancelled. Try again in a moment.`,
    "orderRefundFailed",
    502,
  )
  error.data = { provider }
  return error
}

/** Paid, but the provider has not settled it yet: nothing to refund yet. */
export const orderPaymentProcessingException = () =>
  new ChatbotXException(
    "A payment for this order is still being processed. Try again later.",
    "orderPaymentProcessing",
    409,
  )

/** The provider's page sends the customer back to their own order. */
export const orderPaymentContactRequiredException = () =>
  new ChatbotXException(
    "An order paid online needs a contact (the customer).",
    "orderPaymentContactRequired",
  )

/** Only a pending online order still waiting for its money can be paid. */
export const orderPaymentNotOpenException = (reason: string) => {
  const error = new ChatbotXException(
    "This order cannot be paid online now.",
    "orderPaymentNotOpen",
    409,
  )
  error.data = { reason }
  return error
}

/** Deleting a paid online order would keep the money without an order. */
export const orderPaidOnlineException = () =>
  new ChatbotXException(
    "This order was paid online. Cancel it first: cancelling refunds the payment.",
    "orderPaidOnline",
    409,
  )

export const orderShippingTypeUnavailableException = (shippingType: string) => {
  const error = new ChatbotXException(
    `The store does not offer ${shippingType}.`,
    "orderShippingTypeUnavailable",
  )
  error.data = { shippingType }
  return error
}
