import {
  metaCatalogSyncRunService,
  productService,
} from "@chatbotx.io/business"
import { EditProduct } from "@/features/products/components/edit-product"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { workspaceId, id } = await params

  // Sequential on purpose: `findById` is what proves the product belongs to
  // this workspace, and the link table it guards has no workspace of its own.
  const product = await productService.findById(id, workspaceId)
  const metaCatalogLink = await metaCatalogSyncRunService.findProductLink(
    product.id,
  )

  return (
    <EditProduct
      metaCatalogId={metaCatalogLink?.catalogId ?? null}
      product={product}
      workspaceId={workspaceId}
    />
  )
}
