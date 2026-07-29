import { productCategoryService } from "@chatbotx.io/business"
import { ManageCategories } from "@/features/product-categories/components/manage-categories"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export default async function ProductCategoriesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  await assertCurrentUserCanAccessChatbot(workspaceId)

  // The whole tree, both levels: which level is shown is a client-side concern
  // driven by `?parentId=`, so re-fetching per drill-in would buy nothing.
  const categories = await productCategoryService.list(workspaceId)

  return <ManageCategories categories={categories} workspaceId={workspaceId} />
}
