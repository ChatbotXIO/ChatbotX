import { notFound } from "next/navigation"
import { CreateProduct } from "@/features/products/components/create-product"
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

  return <CreateProduct workspaceId={data.workspaceId} />
}
