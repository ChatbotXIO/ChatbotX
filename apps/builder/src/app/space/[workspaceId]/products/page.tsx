import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { AppTab } from "@/components/app-tab"
import { ProductsTable } from "@/features/products/products-table"
import { listProductsRSC } from "@/features/products/queries"
import { listProductsSearchParams } from "@/features/products/schema/query"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const t = await getTranslations()
  const search = listProductsSearchParams.parse(await searchParams)

  const promises = Promise.all([
    listProductsRSC({
      workspaceId: data.workspaceId,
      page: search.page,
      perPage: search.perPage,
      sort: search.sort,
      name: search.name,
    }),
  ]) as Promise<[Awaited<ReturnType<typeof listProductsRSC>>]>

  return (
    <div className="space-y-4 p-6">
      <AppTab
        tabs={[
          {
            label: t("products.title"),
            href: `/space/${data.workspaceId}/products`,
            isActive: true,
          },
          {
            label: t("orders.title"),
            href: `/space/${data.workspaceId}/orders`,
            isActive: false,
          },
          {
            label: t("settings.title"),
            href: `/space/${data.workspaceId}/ecommerce-settings`,
            isActive: false,
          },
        ]}
      />

      <Suspense fallback={null}>
        <ProductsTable promises={promises} workspaceId={data.workspaceId} />
      </Suspense>
    </div>
  )
}
