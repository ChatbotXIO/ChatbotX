import {
  integrationMetaCatalogService,
  metaCatalogSyncRunService,
  productCategoryService,
  productService,
} from "@chatbotx.io/business"
import { listImports } from "@/features/import/queries/list-imports.queries"
import { CategorySidebar } from "@/features/product-categories/components/category-sidebar"
import { toSafeMetaCatalogConnection } from "@/features/products/lib/meta-catalog-connection"
import { ProductsTable } from "@/features/products/products-table"
import { listProductsSearchParams } from "@/features/products/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { workspaceId } = await params
  const search = listProductsSearchParams.parse(await searchParams)
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const [products, categories, importHistory, metaConnection, metaHistory] =
    await Promise.all([
      productService.list({
        workspaceId,
        page: search.page,
        perPage: search.perPage,
        sort: search.sort,
        name: search.name,
        categoryId: search.categoryId,
      }),
      productCategoryService.list(workspaceId),
      listImports({
        workspaceId,
        type: "products",
        page: 1,
        perPage: 10,
      }),
      integrationMetaCatalogService.findByWorkspaceId(workspaceId),
      metaCatalogSyncRunService.list(workspaceId),
    ])
  return (
    <div className="flex min-h-0 flex-1">
      <CategorySidebar categories={categories} workspaceId={workspaceId} />
      <div className="min-w-0 flex-1 p-4">
        <ProductsTable
          importHistoryPromise={Promise.resolve([importHistory])}
          initialMetaCatalogState={{
            connection: toSafeMetaCatalogConnection(metaConnection),
            history: metaHistory,
          }}
          promises={Promise.resolve([products])}
          workspaceId={workspaceId}
        />
      </div>
    </div>
  )
}
