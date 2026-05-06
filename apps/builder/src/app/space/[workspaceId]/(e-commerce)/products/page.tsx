import { ProductsTable } from "@/features/products/products-table"
import { listProductsSearchParams } from "@/features/products/schema/query"
import { productService } from "@/features/products/services"

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { workspaceId } = await params
  const search = listProductsSearchParams.parse(await searchParams)

  const promises = Promise.all([
    productService.listRSC({
      workspaceId,
      page: search.page,
      perPage: search.perPage,
      sort: search.sort,
      name: search.name,
    }),
  ])

  return <ProductsTable promises={promises} workspaceId={workspaceId} />
}
