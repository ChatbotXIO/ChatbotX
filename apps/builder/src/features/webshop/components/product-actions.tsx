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
}: {
  product: ShopProduct
  compact?: boolean
  /** The product page draws its own Add to Cart, with quantity. */
  showPrimary?: boolean
}) {
  const t = useTranslations("webshop")
  const shop = useShop()
  const { change, isPending } = useCartChange()
  const { saved, toggle } = useSavedProduct(shop.workspaceId, product.id)
  const buttons = new Set(shop.productButtons)
  const detailHref = shop.href(`/products/${product.id}`)
  const saveLabel = saved ? t("saved") : t("save")

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
          className={buttonVariants({ size: "sm" })}
          href={product.productUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ExternalLinkIcon />
          {t("buy")}
        </a>
      ) : null
    }
    if (!product.inStock) {
      return (
        <Button disabled size="sm" variant="secondary">
          {t("outOfStock")}
        </Button>
      )
    }
    if (product.hasVariants) {
      return (
        <Link className={buttonVariants({ size: "sm" })} href={detailHref}>
          <ShoppingCartIcon />
          {t("chooseOptions")}
        </Link>
      )
    }
    return (
      <Button
        disabled={isPending || shop.preview}
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
        {t("addToCart")}
      </Button>
    )
  })()

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", compact && "gap-1")}
    >
      {primary}
      {buttons.has("share") ? (
        <Button
          aria-label={t("share")}
          onClick={share}
          size={compact ? "icon" : "sm"}
          variant="outline"
        >
          <Share2Icon />
          {compact ? null : t("share")}
        </Button>
      ) : null}
      {buttons.has("similar") && product.categoryId ? (
        <Link
          aria-label={t("similar")}
          className={buttonVariants({
            size: compact ? "icon" : "sm",
            variant: "outline",
          })}
          href={shop.href("", { category: product.categoryId })}
        >
          <LayersIcon />
          {compact ? null : t("similar")}
        </Link>
      ) : null}
      {buttons.has("save") ? (
        <Button
          aria-label={saveLabel}
          aria-pressed={saved}
          onClick={toggle}
          size={compact ? "icon" : "sm"}
          variant="outline"
        >
          <HeartIcon className={cn(saved && "fill-current text-red-500")} />
          {compact ? null : saveLabel}
        </Button>
      ) : null}
    </div>
  )
}
