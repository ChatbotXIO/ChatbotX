import {
  type CurrencyPosition,
  EXTERNAL_STORE_NAMES,
  type ExternalStoreSource,
  type StoreSource,
} from "@chatbotx.io/database/partials"
import {
  ecommerceSettingsRepository,
  shopifyRepository,
  woocommerceRepository,
} from "@chatbotx.io/database/repositories"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import { ChatbotXException } from "../errors"

/** The tag every cached read of a workspace's store settings carries. */
export const ecommerceSettingsCacheTag = (workspaceId: string) =>
  `ecommerce-settings:${workspaceId}`

/**
 * Where the store's catalog and orders come from. Its own module, apart from
 * `ecommerceSettingsService`, so the catalog services can read it without
 * pulling in everything the settings validation needs. Cached under the
 * settings tag, so saving the settings drops it too.
 */
export const resolveStoreSource = async (
  workspaceId: string,
): Promise<StoreSource> =>
  await withCache(
    `${ecommerceSettingsCacheTag(workspaceId)}:store-source`,
    async () =>
      (await ecommerceSettingsRepository.find(workspaceId))?.storeSource ??
      "chatbotx",
    { tags: [ecommerceSettingsCacheTag(workspaceId)] },
  )

/**
 * A store can only sell from an external store it is connected to: switching
 * the source to one that is not connected is refused.
 */
export const assertExternalStoreConnected = async (
  workspaceId: string,
  source: ExternalStoreSource,
): Promise<{ currency: string }> => {
  const connected =
    source === "shopify"
      ? await shopifyRepository.findIntegration(workspaceId)
      : await woocommerceRepository.findIntegration(workspaceId)
  if (!connected) {
    const name = EXTERNAL_STORE_NAMES[source]
    const error = new ChatbotXException(
      `Connect a ${name} store in Ecommerce → Settings → ${name} before selling from it.`,
      "externalStoreNotConnected",
      400,
    )
    error.data = { store: source }
    throw error
  }
  return { currency: connected.currency }
}

/**
 * A disconnected external store stops being the store's source: the store
 * goes back to its own catalog. A store selling from the other external
 * store is left as it is.
 */
export const switchStoreBackFrom = async (
  workspaceId: string,
  source: ExternalStoreSource,
): Promise<void> => {
  const current = await ecommerceSettingsRepository.find(workspaceId)
  if (current?.storeSource !== source) {
    return
  }
  await ecommerceSettingsRepository.setStoreSource({
    workspaceId,
    storeSource: "chatbotx",
  })
}

/**
 * The symbol a currency is usually written with (`₫`, `$`, `€`), or null
 * when there is none but the code itself.
 */
export const currencySymbolFor = (currency: string): string | null => {
  try {
    const symbol = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value
    return symbol && symbol.toUpperCase() !== currency.toUpperCase()
      ? symbol
      : null
  } catch {
    return null
  }
}

/**
 * A store selling from an external store shows prices and charges orders
 * in that store's currency: products, carts, orders, messages and analytics
 * all read `payments.currency`, so it follows the store. Does nothing once
 * the store sells from somewhere else.
 */
export const adoptExternalStoreCurrency = async (input: {
  workspaceId: string
  source: ExternalStoreSource
  currency: string
  currencySymbol?: string | null
  currencyPosition?: CurrencyPosition | null
}): Promise<void> => {
  const changed = await ecommerceSettingsRepository.setCurrencyFromStore({
    workspaceId: input.workspaceId,
    storeSource: input.source,
    currency: input.currency.toUpperCase(),
    currencySymbol:
      input.currencySymbol === undefined
        ? currencySymbolFor(input.currency)
        : input.currencySymbol,
    currencyPosition: input.currencyPosition ?? undefined,
  })
  if (changed) {
    await invalidateCacheByTags([ecommerceSettingsCacheTag(input.workspaceId)])
  }
}
