import { ecommerceSettingsService, orderService } from "@chatbotx.io/business"
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
    }),
    ecommerceSettingsService.get(workspaceId),
  ])

  return (
    <OrdersTable
      orders={orders}
      store={{
        currency: settings.payments.currency,
        currencySymbol: settings.payments.currencySymbol,
        currencyPosition: settings.payments.currencyPosition,
      }}
      workspaceId={workspaceId}
    />
  )
}
