import { webshopService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ProductDetail } from "@/features/webshop/components/product-detail"
import {
  ShopInvalidLink,
  ShopLayout,
} from "@/features/webshop/components/shop-layout"
import {
  asId,
  loadShopPage,
  type ShopPageProps,
} from "@/features/webshop/lib/shop-page"
import { toShopProductDetail } from "@/features/webshop/lib/shop-product"

export const dynamic = "force-dynamic"

type Props = ShopPageProps<{ productId: string }>

/** A product the shop no longer shows reads as not found. */
async function findProduct(workspaceId: string, productId: string | null) {
  if (!productId) {
    return null
  }
  try {
    return await webshopService.getProduct({ workspaceId, productId })
  } catch (error) {
    if (error instanceof ChatbotXException && error.code === "notFound") {
      return null
    }
    throw error
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const page = await loadShopPage(props)
  const t = await getTranslations("webshop")
  const product = page
    ? await findProduct(page.params.workspaceId, asId(page.params.productId))
    : null
  return {
    title: product?.name ?? page?.shop.storeName ?? t("metadataTitle"),
    robots: { index: false },
  }
}

export default async function ShopProductPage(props: Props) {
  const page = await loadShopPage(props)
  if (!page) {
    return <ShopInvalidLink />
  }
  const t = await getTranslations("webshop")
  const { shop, session, params, cartCount } = page
  const product = await findProduct(params.workspaceId, asId(params.productId))

  return (
    <ShopLayout
      cartCount={cartCount}
      session={session}
      shop={shop}
      workspaceId={params.workspaceId}
    >
      {product ? (
        <ProductDetail
          imageSize={shop.productImageSize}
          product={toShopProductDetail(product)}
        />
      ) : (
        <p className="py-16 text-center text-muted-foreground">
          {t("productNotFound")}
        </p>
      )}
    </ShopLayout>
  )
}
