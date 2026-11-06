import { ChatbotXException } from "../errors"

export const shopifyNotConnectedException = () =>
  new ChatbotXException(
    "Connect a Shopify store in Ecommerce → Settings → Shopify first.",
    "shopifyNotConnected",
  )

/** Shopify refused the token, secret, or client credentials. */
export const shopifyCredentialsInvalidException = (detail?: string) => {
  const error = new ChatbotXException(
    `Shopify did not accept these credentials${detail ? `: ${detail}` : "."} Check the store domain and the app's token or keys, and that the app is installed with the required scopes.`,
    "shopifyCredentialsInvalid",
  )
  error.data = { detail: detail ?? "" }
  return error
}

/**
 * Products, categories, vendors, discount codes and orders mirrored from
 * Shopify are changed in Shopify; the next sync would undo an edit here.
 */
export const shopifyManagedException = () =>
  new ChatbotXException(
    "This store is managed in Shopify. Change it in Shopify and it syncs here.",
    "shopifyManaged",
    409,
  )

export const shopifySyncInProgressException = () =>
  new ChatbotXException(
    "A Shopify sync is already running. Wait for it to finish.",
    "shopifySyncInProgress",
    409,
  )

/** Shopify refused the order (out of stock, bad address, …). */
export const shopifyOrderRejectedException = (detail: string) => {
  const error = new ChatbotXException(
    `Shopify could not place the order: ${detail}`,
    "shopifyOrderRejected",
    422,
  )
  error.data = { detail }
  return error
}

/** A product in the cart has no Shopify variant to order. */
export const shopifyVariantMissingException = () =>
  new ChatbotXException(
    "A product in the cart is no longer sold on Shopify. Remove it and try again.",
    "shopifyVariantMissing",
    409,
  )
