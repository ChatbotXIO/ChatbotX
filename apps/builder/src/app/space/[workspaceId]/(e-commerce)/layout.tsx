import { createWebshopShareLinks } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { type ReactNode, Suspense } from "react"
import { EcommerceFooterLayout } from "@/features/products/components/ecommerce-footer"
import { EcommerceTabs } from "@/features/products/components/ecommerce-tabs"
import { ShopLinkSection } from "@/features/webshop/components/shop-link-section"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

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
  // Every Ecommerce page asks for this permission too; checked here so the
  // shop link bar below is never shown to a member who cannot open them.
  await requireWorkspacePermission(data.workspaceId, "ecommerce")
  // The same links `webshop.getLink` returns without a contact.
  const shareLinks = await createWebshopShareLinks({
    workspaceId: data.workspaceId,
  })

  // The shop link is pinned at the bottom of every Ecommerce page, unless the
  // page puts its own actions there (a form's Cancel / Save).
  return (
    <EcommerceFooterLayout
      shopLink={
        <ShopLinkSection
          buttonUrls={shareLinks.buttonUrls}
          previewUrl={shareLinks.previewUrl}
        />
      }
    >
      <EcommerceTabs workspaceId={data.workspaceId} />

      <Suspense fallback={null}>{children}</Suspense>
    </EcommerceFooterLayout>
  )
}
