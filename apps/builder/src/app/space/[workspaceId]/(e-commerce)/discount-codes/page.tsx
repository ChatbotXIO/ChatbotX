import {
  discountCodeService,
  ecommerceSettingsService,
} from "@chatbotx.io/business"
import { DiscountCodesTable } from "@/features/discount-codes/discount-codes-table"
import { listDiscountCodesSearchParams } from "@/features/discount-codes/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export default async function DiscountCodesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { workspaceId } = await params
  const search = listDiscountCodesSearchParams.parse(await searchParams)
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const [discountCodes, settings] = await Promise.all([
    discountCodeService.list({
      workspaceId,
      code: search.code,
      page: search.page,
      perPage: search.perPage,
    }),
    ecommerceSettingsService.get(workspaceId),
  ])

  return (
    <DiscountCodesTable
      discountCodes={discountCodes}
      store={{
        currency: settings.payments.currency,
        currencySymbol: settings.payments.currencySymbol,
        currencyPosition: settings.payments.currencyPosition,
      }}
      workspaceId={workspaceId}
    />
  )
}
