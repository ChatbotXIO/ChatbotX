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

  // The whole tree, both levels: the table expands in place, so there is no
  // navigation left that a second fetch could serve.
  const categories = await productCategoryService.list(workspaceId)

  return <ManageCategories categories={categories} workspaceId={workspaceId} />
}
