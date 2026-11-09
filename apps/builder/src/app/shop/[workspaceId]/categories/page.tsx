import type { Metadata } from "next"
import { CategoryGrid } from "@/features/webshop/components/category-grid"
import {
  ShopInvalidLink,
  ShopLayout,
} from "@/features/webshop/components/shop-layout"
import {
  getShopPageTranslations,
  loadShopPage,
  type ShopPageProps,
} from "@/features/webshop/lib/shop-page"

export const dynamic = "force-dynamic"

type Props = ShopPageProps<Record<string, never>>

export async function generateMetadata(props: Props): Promise<Metadata> {
  const t = await getShopPageTranslations(props)
  return { title: t("categories"), robots: { index: false } }
}

/** The shop's visible categories; each card opens the shop on its products. */
export default async function ShopCategoriesPage(props: Props) {
  const page = await loadShopPage(props)
  if (!page) {
    return <ShopInvalidLink />
  }
  const { shop, session, params, cartCount } = page

  return (
    <ShopLayout
      cartCount={cartCount}
      session={session}
      shop={shop}
      workspaceId={params.workspaceId}
    >
      <CategoryGrid categories={shop.categories} />
    </ShopLayout>
  )
}
