import { webshopService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { Metadata } from "next"
import { OrderView } from "@/features/webshop/components/order-view"
import {
  ShopInvalidLink,
  ShopLayout,
} from "@/features/webshop/components/shop-layout"
import {
  asId,
  getParam,
  getShopPageTranslations,
  getShopTranslations,
  loadShopPage,
  type ShopPageProps,
} from "@/features/webshop/lib/shop-page"
import type { ShopSession } from "@/features/webshop/lib/shop-session"

export const dynamic = "force-dynamic"

type Props = ShopPageProps<{ orderId: string }>

/**
 * Only the customer's own order; anything else reads as not found. Back from
 * the provider's page (`payment=return`), the payment is read back first so
 * the order shows paid without waiting for the webhook.
 */
async function findOrder(
  session: ShopSession,
  orderId: string | null,
  returnedFromPayment: boolean,
) {
  if (session.mode !== "customer" || !orderId) {
    return null
  }
  const input = {
    workspaceId: session.shopper.workspaceId,
    contactId: session.shopper.contactId,
    orderId,
  }
  try {
    return returnedFromPayment
      ? await webshopService.refreshCustomerOrderPayment(input)
      : await webshopService.getCustomerOrder(input)
  } catch (error) {
    if (error instanceof ChatbotXException && error.code === "notFound") {
      return null
    }
    throw error
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const t = await getShopPageTranslations(props)
  return { title: t("metadataOrderTitle"), robots: { index: false } }
}

export default async function ShopOrderPage(props: Props) {
  const page = await loadShopPage(props)
  if (!page) {
    return <ShopInvalidLink />
  }
  const t = await getShopTranslations(page.shop)
  const { shop, session, params, searchParams, cartCount } = page
  const paymentReturn = getParam(searchParams.payment)
  const order = await findOrder(
    session,
    asId(params.orderId),
    paymentReturn === "return",
  )

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
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null,
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
          paymentReturn={
            paymentReturn === "return" || paymentReturn === "cancelled"
              ? paymentReturn
              : null
          }
          placed={getParam(searchParams.placed) === "1"}
        />
      ) : (
        <p className="fade-in animate-in py-20 text-center text-muted-foreground duration-500">
          {t("orderNotFound")}
        </p>
      )}
    </ShopLayout>
  )
}
