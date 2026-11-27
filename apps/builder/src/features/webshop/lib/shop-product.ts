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
  /** The product's own SKU; a variant's SKU, when it has one, wins. */
  sku: string | null
  /** Orders go through even with no stock left. */
  allowOutOfStockPurchase: boolean
  longDescription: string | null
  variantOptions: Array<{ name: string; values: string[] }>
  variants: Array<{
    id: string
    combination: Record<string, string>
    price: number
    sku: string | null
    /** Stock of this variant alone; null keeps stock on the product. */
    inventoryQuantity: number | null
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
  /**
   * Stock of each enabled variant, null where the variant has none of its own
   * (Shopify stocks variants one by one).
   */
  variantInventoryQuantities?: Array<number | null>
}

const isProductInStock = (product: ProductRow) =>
  product.inventoryPolicy !== "track" ||
  product.inventoryQuantity > 0 ||
  product.allowOutOfStockPurchase

/**
 * Sold out when the product's own stock is exhausted, or — when its variants
 * are stocked one by one — when every variant is. A variant without stock of
 * its own follows the product.
 */
const isInStock = (product: ProductRow) => {
  const quantities = product.variantInventoryQuantities ?? []
  if (!quantities.some((quantity) => quantity !== null)) {
    return isProductInStock(product)
  }
  return quantities.some((quantity) =>
    quantity === null
      ? isProductInStock(product)
      : quantity > 0 || product.allowOutOfStockPurchase,
  )
}

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
      sku: string | null
      inventoryQuantity: number | null
    }>
    sku: string | null
  },
): ShopProductDetail => ({
  ...toShopProduct({
    ...product,
    variantInventoryQuantities: product.variants.map(
      (variant) => variant.inventoryQuantity,
    ),
  }),
  sku: product.sku,
  allowOutOfStockPurchase: product.allowOutOfStockPurchase,
  hasVariants: product.variants.length > 0,
  longDescription: product.longDescription,
  variantOptions: [...product.variantOptions]
    .sort((a, b) => a.position - b.position)
    .map(({ name, values }) => ({ name, values })),
  variants: product.variants.map(
    ({ id, combination, price, sku, inventoryQuantity }) => ({
      id,
      combination,
      price,
      sku,
      inventoryQuantity,
    }),
  ),
})

/** The price after the effective discount (`ShopProduct.discount`), as the cart will charge it. */
export const discountedPrice = (
  product: Pick<ShopProduct, "discount">,
  price: number,
) => (product.discount > 0 ? price * (1 - product.discount / 100) : price)
