import { ProductForm } from "@/features/products/components/product-form"
import { ProductStoreProvider } from "@/features/products/provider/product-store-context"
import { productService } from "@/features/products/services"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { workspaceId, id } = await params

  const product = await productService.findById(id, workspaceId)

  return (
    <ProductStoreProvider workspaceId={workspaceId}>
      <ProductForm product={product} workspaceId={workspaceId} />
    </ProductStoreProvider>
  )
}
