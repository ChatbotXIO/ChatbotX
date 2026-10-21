import { webshopService } from "@chatbotx.io/business"
import {
  SHIPPING_TYPES_BY_MODE,
  type ShippingType,
} from "@chatbotx.io/database/partials"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { CartView } from "@/features/webshop/components/cart-view"
import {
  ShopInvalidLink,
  ShopLayout,
} from "@/features/webshop/components/shop-layout"
import {
  getParam,
  loadShopPage,
  type ShopPageProps,
} from "@/features/webshop/lib/shop-page"

export const dynamic = "force-dynamic"

type Props = ShopPageProps<Record<string, never>>

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("webshop")
  return { title: t("cart"), robots: { index: false } }
}

/** The cart and its checkout; prices follow the delivery choice in the URL. */
export default async function ShopCartPage(props: Props) {
  const page = await loadShopPage(props)
  if (!page) {
    return <ShopInvalidLink />
  }
  const t = await getTranslations("webshop")
  const { shop, session, params, searchParams, cartCount } = page

  if (session.mode === "preview") {
    return (
      <ShopLayout
        cartCount={0}
        session={session}
        shop={shop}
        workspaceId={params.workspaceId}
      >
        <p className="py-16 text-center text-muted-foreground">
          {t("errors.webshopPreviewOnly")}
        </p>
      </ShopLayout>
    )
  }

  const offered: readonly ShippingType[] =
    SHIPPING_TYPES_BY_MODE[shop.shipping.mode]
  const requested = getParam(searchParams.shipping)
  const shippingType =
    offered.find((type) => type === requested) ?? offered[0] ?? null
  const cart = await webshopService.getCart({
    workspaceId: params.workspaceId,
    contactId: session.shopper.contactId,
    shippingType,
  })

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
          belowMinimum: cart.belowMinimum,
          shippingType: cart.shippingType,
        }}
        shop={shop}
      />
    </ShopLayout>
  )
}
