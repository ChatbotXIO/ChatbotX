import { webshopService } from "@chatbotx.io/business"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ProductFilters } from "@/features/webshop/components/product-filters"
import { ProductList } from "@/features/webshop/components/product-list"
import {
  ShopInvalidLink,
  ShopLayout,
} from "@/features/webshop/components/shop-layout"
import { ShopPagination } from "@/features/webshop/components/shop-pagination"
import {
  asId,
  getParam,
  loadShopPage,
  type ShopPageProps,
} from "@/features/webshop/lib/shop-page"
import { toShopProduct } from "@/features/webshop/lib/shop-product"

export const dynamic = "force-dynamic"

const PER_PAGE = 24
/** Deeper than any real catalog; a huge `?page=` would make a costly OFFSET. */
const MAX_SHOP_PAGE = 1000

type Props = ShopPageProps<Record<string, never>>

export async function generateMetadata(props: Props): Promise<Metadata> {
  const page = await loadShopPage(props)
  const t = await getTranslations("webshop")
  return {
    title: page?.shop.storeName ?? t("metadataTitle"),
    robots: { index: false },
  }
}

/** The shop's front page: products, searchable, by category or vendor. */
export default async function ShopPage(props: Props) {
  const page = await loadShopPage(props)
  if (!page) {
    return <ShopInvalidLink />
  }
  const { shop, session, params, searchParams, cartCount } = page
  const keyword = getParam(searchParams.q)?.trim().slice(0, 255) ?? ""
  const categoryId = asId(getParam(searchParams.category))
  const vendorId = asId(getParam(searchParams.vendor))
  const pageNumber = Math.min(
    MAX_SHOP_PAGE,
    Math.max(1, Math.trunc(Number(getParam(searchParams.page))) || 1),
  )

  const products = await webshopService.listProducts({
    workspaceId: params.workspaceId,
    keyword,
    categoryId,
    vendorId,
    page: pageNumber,
    perPage: PER_PAGE,
  })
  const vendor = vendorId
    ? shop.vendors.find((candidate) => candidate.id === vendorId)
    : undefined
  const category = categoryId
    ? shop.categories.find((candidate) => candidate.id === categoryId)
    : undefined
  const heading = vendor ?? category

  return (
    <ShopLayout
      cartCount={cartCount}
      session={session}
      shop={shop}
      workspaceId={params.workspaceId}
    >
      <div className="space-y-4">
        {heading ? (
          <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
            {heading.imageUrl ? (
              // biome-ignore lint/performance/noImgElement: merchant images come from any host
              <img
                alt=""
                className="size-14 shrink-0 rounded-md object-cover"
                height={56}
                src={heading.imageUrl}
                width={56}
              />
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate font-semibold text-lg">{heading.name}</h1>
              {vendor?.shortDescription ? (
                <p className="line-clamp-2 text-muted-foreground text-sm">
                  {vendor.shortDescription}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        <ProductFilters
          categories={shop.categories}
          categoryId={categoryId}
          keyword={keyword}
          vendorId={vendorId}
          vendors={shop.vendors}
        />
        <ProductList
          products={products.data.map(toShopProduct)}
          view={shop.productView}
        />
        <ShopPagination
          page={pageNumber}
          pageCount={products.pageCount}
          params={{
            q: keyword || null,
            category: categoryId,
            vendor: vendorId,
          }}
        />
      </div>
    </ShopLayout>
  )
}
