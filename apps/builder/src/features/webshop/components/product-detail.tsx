"use client"

import type { ProductImageSize } from "@chatbotx.io/database/partials"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  CheckIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  ShoppingCartIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { discountedPrice, type ShopProductDetail } from "../lib/shop-product"
import { trackPixel } from "./facebook-pixel"
import { ProductActions } from "./product-actions"
import { ProductPrice } from "./product-price"
import { ShopBottomBar } from "./shop-bottom-bar"
import { ShopImage } from "./shop-image"
import { ShopImageCarousel } from "./shop-image-carousel"
import { useShop } from "./shop-provider"
import { useCartChange } from "./use-cart-change"

const MAX_QUANTITY = 10_000

function QuantityInput({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const t = useTranslations("webshop")
  return (
    <div className="flex items-center rounded-full border bg-background">
      <Button
        aria-label={t("decrease")}
        className="rounded-full"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        size="icon"
        variant="ghost"
      >
        <MinusIcon />
      </Button>
      <span
        aria-live="polite"
        className="w-10 text-center font-medium tabular-nums"
      >
        {value}
      </span>
      <Button
        aria-label={t("increase")}
        className="rounded-full"
        disabled={value >= MAX_QUANTITY}
        onClick={() => onChange(value + 1)}
        size="icon"
        variant="ghost"
      >
        <PlusIcon />
      </Button>
    </div>
  )
}

export function ProductDetail({
  product,
  imageSize,
  children,
}: {
  product: ShopProductDetail
  imageSize: ProductImageSize
  /** Drawn under the product, e.g. "You may also like". */
  children?: ReactNode
}) {
  const t = useTranslations("webshop")
  const shop = useShop()
  const { change, isPending } = useCartChange()
  const [imageIndex, setImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [choice, setChoice] = useState<Record<string, string>>({})

  useEffect(() => {
    trackPixel("ViewContent", {
      content_ids: [product.id],
      content_name: product.name,
      content_type: "product",
      currency: shop.money.currency,
      value: discountedPrice(product, product.price),
    })
  }, [product, shop.money.currency])

  const allChosen = product.variantOptions.every(
    (option) => choice[option.name],
  )
  const variant = useMemo(
    () =>
      allChosen
        ? product.variants.find((candidate) =>
            product.variantOptions.every(
              (option) =>
                candidate.combination[option.name] === choice[option.name],
            ),
          )
        : undefined,
    [allChosen, choice, product],
  )
  const price = variant?.price ?? product.price
  const needsVariant = product.hasVariants && !variant

  const canAdd = product.inStock && !needsVariant && !isPending

  const addToCart = () =>
    change({
      mode: "add",
      productId: product.id,
      variantId: variant?.id ?? null,
      quantity,
      price: discountedPrice(product, price),
    })

  return (
    <div
      className={cn(
        "space-y-10",
        // Room under the content for the pinned buy bar.
        hasBuyBar(shop, product.productUrl) && "pb-28",
      )}
    >
      <article className="grid items-start gap-5 md:grid-cols-2">
        <div className="space-y-3 md:sticky md:top-20">
          <div
            className={cn(
              "relative overflow-hidden rounded-2xl border bg-card shadow-xs",
              imageSize === "bigSquare" ? "aspect-square" : "aspect-[4/3]",
            )}
          >
            <ShopImageCarousel
              alt={product.name}
              eager
              iconClassName="size-10"
              images={product.images}
              index={imageIndex}
              onIndexChange={setImageIndex}
              size={800}
            />
            {product.discount > 0 ? (
              <span className="absolute top-3 left-3 rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground text-sm tabular-nums shadow-sm">
                -{Math.round(product.discount)}%
              </span>
            ) : null}
          </div>
          {product.images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {product.images.map((url, index) => (
                <button
                  aria-label={t("showImage", { number: index + 1 })}
                  aria-pressed={index === imageIndex}
                  className={cn(
                    "size-16 shrink-0 overflow-hidden rounded-xl border-2 transition-all duration-200",
                    index === imageIndex
                      ? "border-primary shadow-sm"
                      : "border-transparent opacity-60 hover:opacity-100",
                  )}
                  // biome-ignore lint/suspicious/noArrayIndexKey: the same image may be listed twice
                  key={`${index}-${url}`}
                  onClick={() => setImageIndex(index)}
                  type="button"
                >
                  <ShopImage alt="" size={64} src={url} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-xs">
            <h1 className="font-bold text-2xl leading-tight tracking-tight">
              {product.name}
            </h1>
            {product.vendorName ? (
              <p className="text-muted-foreground text-sm">
                {product.vendorName}
              </p>
            ) : null}
            <ProductPrice
              className="text-2xl"
              discount={product.discount}
              price={price}
            />
            {product.shortDescription ? (
              <p className="text-muted-foreground leading-relaxed">
                {product.shortDescription}
              </p>
            ) : null}

            {product.variantOptions.map((option) => (
              <VariantOptionPicker
                choice={choice}
                key={option.name}
                onChange={(value) =>
                  setChoice((current) => ({ ...current, [option.name]: value }))
                }
                option={option}
                variants={product.variants}
              />
            ))}
            {allChosen && needsVariant ? (
              <p className="text-destructive text-sm">
                {t("variantUnavailable")}
              </p>
            ) : null}

            <BuyControls
              canAdd={canAdd}
              inStock={product.inStock}
              isPending={isPending}
              onAdd={addToCart}
              onQuantityChange={setQuantity}
              productUrl={product.productUrl}
              quantity={quantity}
            />

            <div className="pt-2">
              <ProductActions
                product={{ ...product, hasVariants: false }}
                showPrimary={false}
              />
            </div>
          </div>

          {product.longDescription ? (
            <div className="whitespace-pre-line rounded-2xl border bg-card p-5 text-sm leading-relaxed shadow-xs">
              {product.longDescription}
            </div>
          ) : null}
        </div>
      </article>
      {children}
    </div>
  )
}

/** Whether some variant has `value` for `option`, given the other picks. */
const isValueAvailable = (
  variants: ShopProductDetail["variants"],
  choice: Record<string, string>,
  optionName: string,
  value: string,
) =>
  variants.some(
    (variant) =>
      variant.combination[optionName] === value &&
      Object.entries(choice).every(
        ([name, picked]) =>
          name === optionName ||
          !picked ||
          variant.combination[name] === picked,
      ),
  )

/**
 * One variant option as a row of chips, its name on the left: tap a value to
 * pick it, tap it again to clear it. A value no variant has with the other
 * picks is greyed out.
 */
function VariantOptionPicker({
  option,
  variants,
  choice,
  onChange,
}: {
  option: ShopProductDetail["variantOptions"][number]
  variants: ShopProductDetail["variants"]
  choice: Record<string, string>
  onChange: (value: string) => void
}) {
  const picked = choice[option.name]
  return (
    <fieldset className="grid min-w-0 gap-2 sm:grid-cols-[6rem_1fr] sm:items-start">
      <legend className="sr-only">{option.name}</legend>
      <span aria-hidden className="pt-2 text-muted-foreground text-sm">
        {option.name}
      </span>
      <div className="flex flex-wrap gap-2">
        {option.values.map((value) => {
          const selected = picked === value
          const available = isValueAvailable(
            variants,
            choice,
            option.name,
            value,
          )
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "relative overflow-hidden rounded-md border bg-background px-3.5 py-2 text-sm transition-colors",
                selected
                  ? "border-primary text-primary"
                  : "hover:border-primary/60 hover:text-primary",
                !available &&
                  "cursor-not-allowed border-dashed text-muted-foreground opacity-50 hover:border-border hover:text-muted-foreground",
              )}
              disabled={!(available || selected)}
              key={value}
              onClick={() => onChange(selected ? "" : value)}
              type="button"
            >
              {value}
              {selected ? (
                // The corner tick of the picked chip.
                <span className="absolute -right-px -bottom-px flex size-3.5 items-center justify-center rounded-tl-md bg-primary text-primary-foreground">
                  <CheckIcon className="size-2.5" />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Whether the page shows the pinned buy bar at all. */
const hasBuyBar = (
  shop: ReturnType<typeof useShop>,
  productUrl: string | null,
) =>
  shop.checkoutMode === "productPage"
    ? productUrl !== null
    : shop.productButtons.includes("addToCart")

/**
 * Buy on the product's own page ("visit the external product page"
 * checkout), or quantity + Add to Cart when the store shows that button —
 * pinned to the bottom of the screen.
 */
function BuyControls({
  productUrl,
  inStock,
  canAdd,
  isPending,
  quantity,
  onQuantityChange,
  onAdd,
}: {
  productUrl: string | null
  inStock: boolean
  canAdd: boolean
  isPending: boolean
  quantity: number
  onQuantityChange: (value: number) => void
  onAdd: () => void
}) {
  const t = useTranslations("webshop")
  const shop = useShop()
  if (!hasBuyBar(shop, productUrl)) {
    return null
  }
  if (shop.checkoutMode === "productPage") {
    return (
      <ShopBottomBar className="max-w-xl">
        <a
          className={cn(
            buttonVariants({
              size: "lg",
              className:
                "h-12 w-full rounded-full shadow-md active:scale-[0.98]",
            }),
          )}
          href={productUrl ?? undefined}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ExternalLinkIcon />
          {t("buy")}
        </a>
      </ShopBottomBar>
    )
  }
  return (
    <ShopBottomBar className="max-w-xl">
      <QuantityInput onChange={onQuantityChange} value={quantity} />
      <Button
        className="h-12 flex-1 rounded-full shadow-md active:scale-[0.98]"
        disabled={!canAdd}
        onClick={onAdd}
        size="lg"
      >
        {isPending ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <ShoppingCartIcon />
        )}
        {inStock ? t("addToCart") : t("outOfStock")}
      </Button>
    </ShopBottomBar>
  )
}
