import {
  EXTERNAL_STORE_NAMES,
  type ExternalStoreSource,
} from "@chatbotx.io/database/partials"
import { ChatbotXException } from "../errors"

/**
 * Products, categories, vendors, discount codes and orders mirrored from an
 * external store (Shopify, WooCommerce) are changed on that store; the next
 * sync would undo an edit here. `data.store` names the store.
 */
export const externalStoreManagedException = (source: ExternalStoreSource) => {
  const name = EXTERNAL_STORE_NAMES[source]
  const error = new ChatbotXException(
    `This store is managed in ${name}. Change it in ${name} and it syncs here.`,
    "externalStoreManaged",
    409,
  )
  error.data = { store: source }
  return error
}
