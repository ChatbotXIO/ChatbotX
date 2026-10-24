import {
  ecommerceOpenHoursService,
  productCategoryService,
  vendorService,
} from "@chatbotx.io/business"
import { ProductVendorsTable } from "@/features/product-vendors/product-vendors-table"
import { listProductVendorsSearchParams } from "@/features/product-vendors/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export default async function ProductVendorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { workspaceId } = await params
  const search = listProductVendorsSearchParams.parse(await searchParams)
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const [vendors, categories, openHours] = await Promise.all([
    vendorService.list({
      workspaceId,
      name: search.name,
      page: search.page,
      perPage: search.perPage,
    }),
    productCategoryService.list(workspaceId),
    ecommerceOpenHoursService.list(workspaceId),
  ])

  return (
    <ProductVendorsTable
      categories={categories}
      openHours={openHours}
      vendors={vendors}
      workspaceId={workspaceId}
    />
  )
}
