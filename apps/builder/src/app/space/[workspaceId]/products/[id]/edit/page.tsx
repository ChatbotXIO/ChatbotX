import { notFound } from "next/navigation"
import { ProductForm } from "@/features/products/components/product-form"
import { findProduct, getProductsForSelect } from "@/features/products/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data

  const [product, productOptions] = await Promise.all([
    findProduct(id, workspaceId),
    getProductsForSelect(workspaceId),
  ])

  return (
    <ProductForm
      product={product}
      productOptions={productOptions}
      workspaceId={workspaceId}
    />
  )
}
