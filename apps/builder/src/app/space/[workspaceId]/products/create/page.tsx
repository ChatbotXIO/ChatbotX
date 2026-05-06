import { notFound } from "next/navigation"
import { ProductForm } from "@/features/products/components/product-form"
import { ProductStoreProvider } from "@/features/products/provider/product-store-context"
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

  return (
    <ProductStoreProvider workspaceId={data.workspaceId}>
      <ProductForm workspaceId={data.workspaceId} />
    </ProductStoreProvider>
  )
}
