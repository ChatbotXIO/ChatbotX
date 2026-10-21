"use client"

import type { ProductImageSize } from "@chatbotx.io/database/partials"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ExternalLinkIcon,
  ImageIcon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  ShoppingCartIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { discountedPrice, type ShopProductDetail } from "../lib/shop-product"
import { trackPixel } from "./facebook-pixel"
import { ProductActions } from "./product-actions"
import { ProductPrice } from "./product-price"
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
    <div className="flex items-center rounded-md border">
      <Button
        aria-label={t("decrease")}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        size="icon"
        variant="ghost"
      >
        <MinusIcon />
      </Button>
      <span aria-live="polite" className="w-10 text-center tabular-nums">
        {value}
      </span>
      <Button
        aria-label={t("increase")}
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
}: {
  product: ShopProductDetail
  imageSize: ProductImageSize
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

  const image = product.images[imageIndex] ?? product.images[0]
  const canAdd = !shop.preview && product.inStock && !needsVariant && !isPending

  const addToCart = () =>
    change({
      mode: "add",
      productId: product.id,
      variantId: variant?.id ?? null,
      quantity,
      price: discountedPrice(product, price),
    })

  return (
    <article className="space-y-4">
      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-card",
          imageSize === "bigSquare" ? "aspect-square" : "aspect-[4/3]",
        )}
      >
        {image ? (
          // biome-ignore lint/performance/noImgElement: merchant images come from any host
          <img
            alt={product.name}
            className="h-full w-full object-cover"
            height={800}
            src={image}
            width={800}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted text-muted-foreground">
            <ImageIcon className="size-10" />
          </div>
        )}
      </div>
      {product.images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto">
          {product.images.map((url, index) => (
            <button
              aria-label={t("showImage", { number: index + 1 })}
              aria-pressed={index === imageIndex}
              className={cn(
                "size-16 shrink-0 overflow-hidden rounded-md border-2",
                index === imageIndex ? "border-primary" : "border-transparent",
              )}
              key={url}
              onClick={() => setImageIndex(index)}
              type="button"
            >
              {/* biome-ignore lint/performance/noImgElement: merchant images come from any host */}
              <img
                alt=""
                className="h-full w-full object-cover"
                height={64}
                src={url}
                width={64}
              />
            </button>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border bg-card p-4">
        <h1 className="font-semibold text-xl">{product.name}</h1>
        {product.vendorName ? (
          <p className="text-muted-foreground text-sm">{product.vendorName}</p>
        ) : null}
        <ProductPrice
          className="text-lg"
          discount={product.discount}
          price={price}
        />
        {product.shortDescription ? (
          <p className="text-muted-foreground">{product.shortDescription}</p>
        ) : null}

        {product.variantOptions.map((option) => (
          <div className="space-y-1" key={option.name}>
            <Label>{option.name}</Label>
            <Select
              onValueChange={(value) =>
                setChoice((current) => ({
                  ...current,
                  [option.name]: String(value),
                }))
              }
              value={choice[option.name] ?? ""}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={t("chooseOption", { name: option.name })}
                />
              </SelectTrigger>
              <SelectContent>
                {option.values.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {allChosen && needsVariant ? (
          <p className="text-destructive text-sm">{t("variantUnavailable")}</p>
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
        <div className="whitespace-pre-line rounded-lg border bg-card p-4 text-sm leading-relaxed">
          {product.longDescription}
        </div>
      ) : null}
    </article>
  )
}

/**
 * Buy on the product's own page ("visit the external product page"
 * checkout), or quantity + Add to Cart when the store shows that button.
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
  if (shop.checkoutMode === "productPage") {
    return productUrl ? (
      <a
        className={buttonVariants({ className: "w-full" })}
        href={productUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        <ExternalLinkIcon />
        {t("buy")}
      </a>
    ) : null
  }
  if (!shop.productButtons.includes("addToCart")) {
    return null
  }
  return (
    <div className="flex items-center gap-3 pt-2">
      <QuantityInput onChange={onQuantityChange} value={quantity} />
      <Button className="flex-1" disabled={!canAdd} onClick={onAdd}>
        {isPending ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <ShoppingCartIcon />
        )}
        {inStock ? t("addToCart") : t("outOfStock")}
      </Button>
    </div>
  )
}
