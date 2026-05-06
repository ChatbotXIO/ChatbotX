import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { type ReactNode, Suspense } from "react"
import { AppTab } from "@/components/app-tab"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function ProductsPage({
  params,
  children,
}: {
  params: Promise<{ workspaceId: string }>
  children: ReactNode
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const t = await getTranslations()

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

      <Suspense fallback={null}>{children}</Suspense>
    </div>
  )
}
