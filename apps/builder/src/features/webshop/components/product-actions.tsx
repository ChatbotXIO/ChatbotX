"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ExternalLinkIcon,
  HeartIcon,
  LayersIcon,
  Loader2Icon,
  Share2Icon,
  ShoppingCartIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { discountedPrice, type ShopProduct } from "../lib/shop-product"
import { useShop } from "./shop-provider"
import { useCartChange } from "./use-cart-change"

const savedKey = (workspaceId: string) => `webshop-saved-${workspaceId}`

const readSaved = (workspaceId: string): string[] => {
  try {
    const raw = window.localStorage.getItem(savedKey(workspaceId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : []
  } catch {
    return []
  }
}

/** Saved products live in this browser only, like a bookmark. */
function useSavedProduct(workspaceId: string, productId: string) {
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setSaved(readSaved(workspaceId).includes(productId))
  }, [workspaceId, productId])
  const toggle = () => {
    const current = readSaved(workspaceId)
    const next = current.includes(productId)
      ? current.filter((id) => id !== productId)
      : [...current, productId]
    try {
      window.localStorage.setItem(savedKey(workspaceId), JSON.stringify(next))
    } catch {
      // Private mode: the heart still toggles for this page view.
    }
    setSaved(next.includes(productId))
  }
  return { saved, toggle }
}

/**
 * The buttons the store chose for products (Add to Cart / Share / Similar /
 * Save). With the "visit the external product page" checkout, Add to Cart
 * becomes Buy and opens the product's own page.
 */
export function ProductActions({
  product,
  compact = false,
  showPrimary = true,
  showSimilar = true,
}: {
  product: ShopProduct
  compact?: boolean
  /** The product page draws its own Add to Cart, with quantity. */
  showPrimary?: boolean
  /** Product cards leave "Similar" to the product's own page. */
  showSimilar?: boolean
}) {
  const t = useTranslations("webshop")
  const shop = useShop()
  const { change, isPending } = useCartChange()
  const { saved, toggle } = useSavedProduct(shop.workspaceId, product.id)
  const buttons = new Set(shop.productButtons)
  const detailHref = shop.href(`/products/${product.id}`)
  const saveLabel = saved ? t("saved") : t("save")
  // On a card the row never wraps, so every card lines up: the main button
  // takes what is left and cuts a long label short.
  const primaryClass = cn(
    "rounded-full active:scale-95",
    compact && "min-w-0 flex-1",
  )
  const secondaryClass = "shrink-0 rounded-full active:scale-95"

  const share = async () => {
    const data = {
      title: product.name,
      text: product.name,
      ...(product.productUrl ? { url: product.productUrl } : {}),
    }
    try {
      if (navigator.share) {
        await navigator.share(data)
        return
      }
      await navigator.clipboard.writeText(product.productUrl ?? product.name)
      toast.success(t("linkCopied"))
    } catch {
      // The customer closed the share sheet.
    }
  }

  const primary = (() => {
    if (!(showPrimary && buttons.has("addToCart"))) {
      return null
    }
    if (shop.checkoutMode === "productPage") {
      return product.productUrl ? (
        <a
          className={cn(
            buttonVariants({ size: "sm", className: primaryClass }),
          )}
          href={product.productUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ExternalLinkIcon />
          <span className="truncate">{t("buy")}</span>
        </a>
      ) : null
    }
    if (!product.inStock) {
      return (
        <Button className={primaryClass} disabled size="sm" variant="secondary">
          <span className="truncate">{t("outOfStock")}</span>
        </Button>
      )
    }
    if (product.hasVariants) {
      return (
        <Link
          className={cn(
            buttonVariants({ size: "sm", className: primaryClass }),
          )}
          href={detailHref}
        >
          <ShoppingCartIcon />
          <span className="truncate">{t("chooseOptions")}</span>
        </Link>
      )
    }
    return (
      <Button
        className={primaryClass}
        disabled={isPending}
        onClick={() =>
          change({
            mode: "add",
            productId: product.id,
            variantId: null,
            quantity: 1,
            price: discountedPrice(product, product.price),
          })
        }
        size="sm"
      >
        {isPending ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <ShoppingCartIcon />
        )}
        <span className="truncate">{t("addToCart")}</span>
      </Button>
    )
  })()

  return (
    <div
      className={cn(
        "flex items-center",
        compact ? "flex-nowrap gap-1" : "flex-wrap gap-2",
      )}
    >
      {primary}
      {showSimilar && buttons.has("similar") && product.categoryId ? (
        <Link
          aria-label={t("similar")}
          className={cn(
            buttonVariants({
              size: compact ? "icon" : "sm",
              variant: "outline",
              className: secondaryClass,
            }),
          )}
          href={shop.href("", { category: product.categoryId })}
        >
          <LayersIcon />
          {compact ? null : t("similar")}
        </Link>
      ) : null}
      {buttons.has("share") ? (
        <Button
          aria-label={t("share")}
          className={secondaryClass}
          onClick={share}
          size={compact ? "icon" : "sm"}
          variant="outline"
        >
          <Share2Icon />
          {compact ? null : t("share")}
        </Button>
      ) : null}
      {buttons.has("save") ? (
        <Button
          aria-label={saveLabel}
          aria-pressed={saved}
          className={secondaryClass}
          onClick={toggle}
          size={compact ? "icon" : "sm"}
          variant="outline"
        >
          <HeartIcon
            className={cn(
              "transition-colors",
              saved &&
                "zoom-in-50 animate-in fill-current text-red-500 duration-300",
            )}
            // Saving pops the heart in again.
            key={String(saved)}
          />
          {compact ? null : saveLabel}
        </Button>
      ) : null}
    </div>
  )
}
