import { productCategoryService } from "@chatbotx.io/business"
import { ProductCategoriesTable } from "@/features/product-categories/product-categories-table"
import { listProductCategoriesSearchParams } from "@/features/product-categories/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export default async function ProductCategoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { workspaceId } = await params
  const search = listProductCategoriesSearchParams.parse(await searchParams)
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const { parent, ...categories } = await productCategoryService.listLevel({
    workspaceId,
    parentId: search.parentId,
    name: search.name,
    page: search.page,
    perPage: search.perPage,
  })

  return (
    <ProductCategoriesTable
      categories={categories}
      key={parent?.id ?? "root"}
      parent={parent ? { id: parent.id, name: parent.name } : null}
      workspaceId={workspaceId}
    />
  )
}
