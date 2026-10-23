import { webshopService } from "@chatbotx.io/business"
import {
  SHIPPING_TYPES_BY_MODE,
  type ShippingType,
} from "@chatbotx.io/database/partials"
import type { Metadata } from "next"
import { CartView } from "@/features/webshop/components/cart-view"
import {
  ShopInvalidLink,
  ShopLayout,
} from "@/features/webshop/components/shop-layout"
import { readPreviewCart } from "@/features/webshop/lib/preview-cart"
import {
  getParam,
  getShopPageTranslations,
  loadShopPage,
  type ShopPageProps,
} from "@/features/webshop/lib/shop-page"
import type { ShopSession } from "@/features/webshop/lib/shop-session"

export const dynamic = "force-dynamic"

type Props = ShopPageProps<Record<string, never>>

export async function generateMetadata(props: Props): Promise<Metadata> {
  const t = await getShopPageTranslations(props)
  return { title: t("cart"), robots: { index: false } }
}

/** The customer's cart, or a preview link's cookie cart, priced the same way. */
async function loadCart(
  session: ShopSession,
  workspaceId: string,
  shippingType: ShippingType | null,
) {
  if (session.mode === "customer") {
    return await webshopService.getCart({
      workspaceId,
      contactId: session.shopper.contactId,
      shippingType,
    })
  }
  const previewCart = await readPreviewCart(workspaceId)
  return await webshopService.getPreviewCart({
    workspaceId,
    items: previewCart.items,
    discountCode: previewCart.discountCode,
    shippingType,
  })
}

/**
 * The cart and its checkout; prices follow the delivery choice in the URL.
 * A preview shows all of it too — only placing the order is off.
 */
export default async function ShopCartPage(props: Props) {
  const page = await loadShopPage(props)
  if (!page) {
    return <ShopInvalidLink />
  }
  const { shop, session, params, searchParams, cartCount } = page

  const offered: readonly ShippingType[] =
    SHIPPING_TYPES_BY_MODE[shop.shipping.mode]
  const requested = getParam(searchParams.shipping)
  const shippingType =
    offered.find((type) => type === requested) ?? offered[0] ?? null
  const cart = await loadCart(session, params.workspaceId, shippingType)

  return (
    <ShopLayout
      cartCount={cartCount}
      session={session}
      shop={shop}
      workspaceId={params.workspaceId}
    >
      <CartView
        cart={{
          lines: cart.lines,
          unavailable: cart.unavailable,
          totals: cart.totals,
          enteredDiscountCode: cart.enteredDiscountCode,
          discount: cart.discount,
          discountError: cart.discountError,
          availableDiscounts: cart.availableDiscounts,
          belowMinimum: cart.belowMinimum,
          shippingType: cart.shippingType,
        }}
        shop={shop}
      />
    </ShopLayout>
  )
}
