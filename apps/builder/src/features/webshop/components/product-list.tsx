"use client"

import type { WebshopProductView } from "@chatbotx.io/database/partials"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ImageIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { ShopProduct } from "../lib/shop-product"
import { ProductActions } from "./product-actions"
import { ProductPrice } from "./product-price"
import { useShop } from "./shop-provider"

const LAYOUT_BY_VIEW: Record<WebshopProductView, string> = {
  list: "flex flex-col gap-3",
  listWithoutImage: "flex flex-col gap-3",
  card: "grid grid-cols-2 gap-3 sm:grid-cols-3",
  cardSquare: "grid grid-cols-2 gap-3 sm:grid-cols-3",
  image: "grid grid-cols-1 gap-4 sm:grid-cols-2",
  imageSquare: "grid grid-cols-1 gap-4 sm:grid-cols-2",
}

function ProductImage({
  product,
  className,
}: {
  product: ShopProduct
  className?: string
}) {
  return product.imageUrl ? (
    // biome-ignore lint/performance/noImgElement: merchant images come from any host
    <img
      alt={product.name}
      className={cn("h-full w-full bg-muted object-cover", className)}
      height={400}
      loading="lazy"
      src={product.imageUrl}
      width={400}
    />
  ) : (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-muted text-muted-foreground",
        className,
      )}
    >
      <ImageIcon className="size-8" />
    </div>
  )
}

function ProductText({ product }: { product: ShopProduct }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="line-clamp-2 font-medium leading-snug">{product.name}</p>
      {product.vendorName ? (
        <p className="truncate text-muted-foreground text-xs">
          {product.vendorName}
        </p>
      ) : null}
      <ProductPrice discount={product.discount} price={product.price} />
    </div>
  )
}

/** One product, drawn the way the store's "Web shop product view" says. */
function ProductItem({
  product,
  view,
}: {
  product: ShopProduct
  view: WebshopProductView
}) {
  const shop = useShop()
  const href = shop.href(`/products/${product.id}`)

  if (view === "list" || view === "listWithoutImage") {
    return (
      <div className="flex gap-3 rounded-lg border bg-card p-3">
        {view === "list" ? (
          <Link
            className="size-20 shrink-0 overflow-hidden rounded-md"
            href={href}
          >
            <ProductImage product={product} />
          </Link>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Link href={href}>
            <ProductText product={product} />
          </Link>
          <ProductActions compact product={product} />
        </div>
      </div>
    )
  }

  const square = view === "cardSquare" || view === "imageSquare"
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <Link
        className={cn(
          "block overflow-hidden",
          square ? "aspect-square" : "aspect-[4/3]",
        )}
        href={href}
      >
        <ProductImage product={product} />
      </Link>
      <div className="flex flex-1 flex-col justify-between gap-3 p-3">
        <Link href={href}>
          <ProductText product={product} />
        </Link>
        <ProductActions compact product={product} />
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
      <p className="py-16 text-center text-muted-foreground">
        {t("noProducts")}
      </p>
    )
  }
  return (
    <div className={LAYOUT_BY_VIEW[view]}>
      {products.map((product) => (
        <ProductItem key={product.id} product={product} view={view} />
      ))}
    </div>
  )
}
