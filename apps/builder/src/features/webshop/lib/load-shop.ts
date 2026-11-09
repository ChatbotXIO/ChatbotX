import "server-only"

import { webshopService } from "@chatbotx.io/business"
import {
  isExternalStoreSource,
  type PaymentMethod,
} from "@chatbotx.io/database/partials"
import { cache } from "react"
import { resolveLocale } from "@/i18n/config"
import { toSafeWebUrl } from "./safe-url"
import type { ShopMoneyFormat } from "./shop-money"
import { resolveShopSession, type ShopSession } from "./shop-session"

type Storefront = Awaited<ReturnType<typeof webshopService.getStorefront>>

/** What every shop page needs from the store, safe to hand to the browser. */
export type ShopView = ReturnType<typeof toShopView>

/**
 * An external store (Shopify, WooCommerce) takes cash on delivery here and
 * nothing else online.
 */
const EXTERNAL_STORE_PAYMENT_METHODS: PaymentMethod[] = ["cod"]

const toShopView = (storefront: Storefront) => {
  const { settings } = storefront
  const storeSource = settings.general.storeSource
  const isExternalStore = isExternalStoreSource(storeSource)
  const externalWebCheckout =
    isExternalStore &&
    settings.checkout.externalCheckoutMethod === "webCheckout"
  const money: ShopMoneyFormat = {
    currency: settings.payments.currency,
    currencySymbol: settings.payments.currencySymbol,
    currencyPosition: settings.payments.currencyPosition,
  }
  return {
    storeName: storefront.storeName,
    brandColor: storefront.brandColor,
    // The shop speaks the workspace language, whoever opens the link.
    locale: resolveLocale(storefront.language),
    ordering: storefront.ordering,
    money,
    productView: settings.general.webshopProductView,
    productImageSize: settings.general.productImageSize,
    productButtons: settings.general.productButtons,
    allowRateOrders: settings.general.allowRateOrders,
    // Only connected providers are ever offered (disconnecting drops them).
    paymentMethods: isExternalStore
      ? EXTERNAL_STORE_PAYMENT_METHODS
      : settings.payments.paymentMethods,
    facebookPixelId: settings.general.facebookPixelId,
    checkout: {
      mode: settings.checkout.checkoutMode,
      externalLink: toSafeWebUrl(settings.checkout.checkoutLink),
      minimumOrderValue: settings.checkout.minimumOrderValue,
      requireName: settings.checkout.requireName,
      requireEmail: settings.checkout.requireEmail,
      requirePhone: settings.checkout.requirePhone,
      requireState: settings.checkout.requireState,
      requireZip: settings.checkout.requireZip,
      // Web Checkout sends the customer to the store's own page to pay: no
      // payment choice here.
      externalWebCheckout,
      // Shopify's checkout also prices delivery; WooCommerce's payment page
      // takes the delivery fee set here.
      shopifyWebCheckout: externalWebCheckout && storeSource === "shopify",
      // The store's codes are only offered when they apply automatically.
      showDiscountCodes:
        !isExternalStore || settings.checkout.externalAutoApplyDiscounts,
    },
    shipping: {
      mode: settings.shipping.shippingType,
      storeAddress: settings.shipping.storeAddress,
      countries: settings.shipping.shippingCountries,
      defaultCountry: settings.shipping.defaultShippingCountry,
      deliveryCost: settings.shipping.deliveryCost,
    },
    categories: storefront.categories.map((category) => ({
      id: category.id,
      parentId: category.parentId,
      name: category.name,
      imageUrl: category.imageUrl,
    })),
    vendors: storefront.vendors.map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      shortDescription: vendor.shortDescription,
      imageUrl: vendor.imageUrl,
    })),
  }
}

/**
 * The shop for one request: who is shopping and what the store shows. `null`
 * when the link is not valid for this workspace. Cached per request, so the
 * page and its metadata read it once.
 */
export const loadShop = cache(
  async (
    workspaceId: string,
    token: string | null | undefined,
  ): Promise<{ session: ShopSession; shop: ShopView } | null> => {
    const session = await resolveShopSession(workspaceId, token)
    if (!session) {
      return null
    }
    const storefront = await webshopService.getStorefront(workspaceId)
    return { session, shop: toShopView(storefront) }
  },
)
