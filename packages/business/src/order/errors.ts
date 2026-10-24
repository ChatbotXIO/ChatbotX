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

export const orderShippingTypeUnavailableException = (shippingType: string) => {
  const error = new ChatbotXException(
    `The store does not offer ${shippingType}.`,
    "orderShippingTypeUnavailable",
  )
  error.data = { shippingType }
  return error
}
