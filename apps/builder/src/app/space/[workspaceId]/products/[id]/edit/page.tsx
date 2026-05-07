import { EditProduct } from "@/features/products/components/edit-product"
import { productService } from "@/features/products/services"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { workspaceId, id } = await params

  const product = await productService.findById(id, workspaceId)

  return <EditProduct product={product} workspaceId={workspaceId} />
}
