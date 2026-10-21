import { webshopService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { OrderView } from "@/features/webshop/components/order-view"
import {
  ShopInvalidLink,
  ShopLayout,
} from "@/features/webshop/components/shop-layout"
import {
  asId,
  getParam,
  loadShopPage,
  type ShopPageProps,
} from "@/features/webshop/lib/shop-page"
import type { ShopSession } from "@/features/webshop/lib/shop-session"

export const dynamic = "force-dynamic"

type Props = ShopPageProps<{ orderId: string }>

/** Only the customer's own order; anything else reads as not found. */
async function findOrder(session: ShopSession, orderId: string | null) {
  if (session.mode !== "customer" || !orderId) {
    return null
  }
  try {
    return await webshopService.getCustomerOrder({
      workspaceId: session.shopper.workspaceId,
      contactId: session.shopper.contactId,
      orderId,
    })
  } catch (error) {
    if (error instanceof ChatbotXException && error.code === "notFound") {
      return null
    }
    throw error
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("webshop")
  return { title: t("metadataOrderTitle"), robots: { index: false } }
}

export default async function ShopOrderPage(props: Props) {
  const page = await loadShopPage(props)
  if (!page) {
    return <ShopInvalidLink />
  }
  const t = await getTranslations("webshop")
  const { shop, session, params, searchParams, cartCount } = page
  const order = await findOrder(session, asId(params.orderId))

  return (
    <ShopLayout
      cartCount={cartCount}
      session={session}
      shop={shop}
      workspaceId={params.workspaceId}
    >
      {order ? (
        <OrderView
          canRate={shop.allowRateOrders && order.status === "concluded"}
          order={{
            id: order.id,
            number: order.number,
            status: order.status,
            currency: order.currency,
            subtotal: order.subtotal,
            discountTotal: order.discountTotal,
            shippingTotal: order.shippingTotal,
            serviceFeeTotal: order.serviceFeeTotal,
            taxTotal: order.taxTotal,
            couponDiscount: order.couponDiscount,
            discountCode: order.discountCode,
            total: order.total,
            shippingType: order.shippingType,
            createdAt: order.createdAt.toISOString(),
            rating: order.rating,
            ratingComment: order.ratingComment,
            items: order.items.map((item) => ({
              id: item.id,
              name: item.name,
              variantLabel: item.variantLabel,
              quantity: item.quantity,
              lineTotal: item.lineTotal,
            })),
          }}
          placed={getParam(searchParams.placed) === "1"}
        />
      ) : (
        <p className="py-16 text-center text-muted-foreground">
          {t("orderNotFound")}
        </p>
      )}
    </ShopLayout>
  )
}
