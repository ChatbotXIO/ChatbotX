import type { ProductModel } from "@chatbotx.io/database/types"
import { stackDiscountPercents } from "@chatbotx.io/utils/money"
import { toSafeWebUrl } from "./safe-url"

/** A product as the shop shows it — nothing a customer should not see. */
export type ShopProduct = {
  id: string
  name: string
  shortDescription: string | null
  price: number
  /** Percent off as the cart charges it: the product's and its vendor's, stacked. */
  discount: number
  imageUrl: string | null
  /** Every image, first one first, for the card's carousel. */
  images: string[]
  vendorName: string | null
  categoryId: string | null
  productUrl: string | null
  inStock: boolean
  /** Added from its own page, where the customer picks a variant. */
  hasVariants: boolean
}

export type ShopProductDetail = ShopProduct & {
  longDescription: string | null
  variantOptions: Array<{ name: string; values: string[] }>
  variants: Array<{
    id: string
    combination: Record<string, string>
    price: number
  }>
}

type ProductRow = Pick<
  ProductModel,
  | "id"
  | "name"
  | "shortDescription"
  | "price"
  | "discount"
  | "images"
  | "categoryId"
  | "productUrl"
  | "inventoryPolicy"
  | "inventoryQuantity"
  | "allowOutOfStockPurchase"
> & {
  vendor: string | null
  /** The active vendor's own percent off, stacked on the product's. */
  vendorDiscountPercent?: number
  hasVariants?: boolean
}

const isInStock = (product: ProductRow) =>
  product.inventoryPolicy !== "track" ||
  product.inventoryQuantity > 0 ||
  product.allowOutOfStockPurchase

export const toShopProduct = (product: ProductRow): ShopProduct => ({
  id: product.id,
  name: product.name,
  shortDescription: product.shortDescription,
  price: product.price,
  discount: stackDiscountPercents(
    product.discount,
    product.vendorDiscountPercent ?? 0,
  ),
  imageUrl: product.images[0]?.url ?? null,
  images: product.images.map((image) => image.url),
  vendorName: product.vendor,
  categoryId: product.categoryId,
  productUrl: toSafeWebUrl(product.productUrl),
  inStock: isInStock(product),
  hasVariants: product.hasVariants ?? false,
})

export const toShopProductDetail = (
  product: ProductRow & {
    longDescription: string | null
    variantOptions: Array<{ name: string; values: string[]; position: number }>
    variants: Array<{
      id: string
      combination: Record<string, string>
      price: number
    }>
  },
): ShopProductDetail => ({
  ...toShopProduct(product),
  hasVariants: product.variants.length > 0,
  longDescription: product.longDescription,
  variantOptions: [...product.variantOptions]
    .sort((a, b) => a.position - b.position)
    .map(({ name, values }) => ({ name, values })),
  variants: product.variants.map(({ id, combination, price }) => ({
    id,
    combination,
    price,
  })),
})

/** The price after the effective discount (`ShopProduct.discount`), as the cart will charge it. */
export const discountedPrice = (
  product: Pick<ShopProduct, "discount">,
  price: number,
) => (product.discount > 0 ? price * (1 - product.discount / 100) : price)
