"use client"

import type { WebshopProductView } from "@chatbotx.io/database/partials"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { PackageSearchIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { CSSProperties } from "react"
import type { ShopProduct } from "../lib/shop-product"
import { ProductActions } from "./product-actions"
import { ProductPrice } from "./product-price"
import { ShopImageCarousel } from "./shop-image-carousel"
import { useShop } from "./shop-provider"

/** Every product view is a grid: up to five cards a row, as the screen allows. */
const GRID_LAYOUT =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"

/** The card's square product image, in pixels. */
const CARD_IMAGE_SIZE = 200
/** The first row loads at once; the rest as the customer scrolls. */
const EAGER_IMAGES = 5

/** Cards come in one after another; later ones share the last delay. */
const STAGGER_MS = 40
const MAX_STAGGER_STEPS = 12

const ITEM_CLASS =
  "group animate-in fill-mode-both border bg-card shadow-xs transition-[border-color,box-shadow,transform] duration-300 fade-in slide-in-from-bottom-3 hover:-translate-y-0.5 hover:border-primary hover:shadow-md motion-reduce:animate-none motion-reduce:hover:translate-y-0"

const staggerStyle = (index: number): CSSProperties => ({
  animationDelay: `${Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS}ms`,
})

/** The product's own discount, as a "-20%" tag in the image's corner. */
function DiscountTag({ discount }: { discount: number }) {
  if (discount <= 0) {
    return null
  }
  return (
    <span className="absolute top-0 right-0 rounded-bl-md bg-primary/15 px-1.5 py-0.5 font-semibold text-primary text-sm tabular-nums backdrop-blur-sm">
      -{Math.round(discount)}%
    </span>
  )
}

function OutOfStockTag() {
  const t = useTranslations("webshop")
  return (
    <span className="absolute inset-x-0 bottom-0 bg-background/85 py-1 text-center font-medium text-muted-foreground text-xs backdrop-blur-sm">
      {t("outOfStock")}
    </span>
  )
}

/** One product as a grid card; "list without image" drops the image. */
function ProductItem({
  product,
  view,
  index,
}: {
  product: ShopProduct
  view: WebshopProductView
  index: number
}) {
  const shop = useShop()
  const href = shop.href(`/products/${product.id}`)
  const imageClass = cn(
    "transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100",
    !product.inStock && "grayscale-[60%]",
  )

  return (
    <div
      className={cn(ITEM_CLASS, "flex flex-col overflow-hidden rounded-md")}
      style={staggerStyle(index)}
    >
      {view === "listWithoutImage" ? null : (
        <Link
          className="relative block aspect-square overflow-hidden"
          href={href}
        >
          <ShopImageCarousel
            alt={product.name}
            eager={index < EAGER_IMAGES}
            imageClassName={imageClass}
            images={product.images}
            size={CARD_IMAGE_SIZE}
          />
          <DiscountTag discount={product.discount} />
          {product.inStock ? null : <OutOfStockTag />}
        </Link>
      )}
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <Link className="flex flex-1 flex-col gap-1" href={href}>
          <p className="line-clamp-2 min-h-10 text-sm leading-5 transition-colors group-hover:text-primary">
            {product.name}
          </p>
          {product.vendorName ? (
            <p className="truncate text-muted-foreground text-xs">
              {product.vendorName}
            </p>
          ) : null}
          <ProductPrice
            className="mt-auto gap-x-1.5 pt-1 [&>span:first-child]:text-lg"
            discount={product.discount}
            price={product.price}
          />
        </Link>
        <ProductActions compact product={product} showSimilar={false} />
      </div>
    </div>
  )
}

export function ProductList({
  products,
  view,
}: {
  products: ShopProduct[]
  view: WebshopProductView
}) {
  const t = useTranslations("webshop")
  if (products.length === 0) {
    return (
      <div className="fade-in zoom-in-95 flex animate-in flex-col items-center gap-3 py-20 text-center text-muted-foreground duration-500">
        <span className="flex size-16 items-center justify-center rounded-full bg-muted">
          <PackageSearchIcon className="size-7" />
        </span>
        <p>{t("noProducts")}</p>
      </div>
    )
  }
  return (
    <div className={GRID_LAYOUT}>
      {products.map((product, index) => (
        <ProductItem
          index={index}
          key={product.id}
          product={product}
          view={view}
        />
      ))}
    </div>
  )
}
