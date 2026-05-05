import { notFound } from "next/navigation"
import { ProductForm } from "@/features/products/components/product-form"
import { getProductsForSelect } from "@/features/products/queries"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function CreateProductPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const productOptions = await getProductsForSelect(data.workspaceId)

  return (
    <ProductForm
      productOptions={productOptions}
      workspaceId={data.workspaceId}
    />
  )
}
