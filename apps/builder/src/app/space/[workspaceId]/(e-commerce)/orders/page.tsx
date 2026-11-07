import {
  ecommerceSettingsService,
  orderService,
  shopifyIntegrationService,
} from "@chatbotx.io/business"
import { OrdersTable } from "@/features/orders/orders-table"
import { listOrdersSearchParams } from "@/features/orders/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { workspaceId } = await params
  const search = listOrdersSearchParams.parse(await searchParams)
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const [orders, settings] = await Promise.all([
    orderService.list({
      workspaceId,
      page: search.page,
      perPage: search.perPage,
      keyword: search.keyword,
      paymentStatus: search.paymentStatus,
      fulfillmentStatus: search.fulfillmentStatus,
    }),
    ecommerceSettingsService.get(workspaceId),
  ])
  const shopifyStore = await resolveShopifyStore(
    workspaceId,
    settings.general.storeSource,
  )

  return (
    <OrdersTable
      orders={orders}
      shopifyStore={shopifyStore}
      store={{
        currency: settings.payments.currency,
        currencySymbol: settings.payments.currencySymbol,
        currencyPosition: settings.payments.currencyPosition,
      }}
      workspaceId={workspaceId}
    />
  )
}

/** The connected store's links, when Shopify is the order source. */
async function resolveShopifyStore(workspaceId: string, storeSource: string) {
  if (storeSource !== "shopify") {
    return
  }
  const status = await shopifyIntegrationService.getStatus(workspaceId)
  if (!status.connected) {
    return
  }
  return { shopDomain: status.shopDomain, adminUrl: status.adminUrl }
}
