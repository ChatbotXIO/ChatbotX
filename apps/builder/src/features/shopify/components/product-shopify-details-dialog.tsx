"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect } from "react"
import { getProductDetailAction } from "@/features/products/actions/get-product-detail-action"
import { ProductStatusBadge } from "@/features/products/components/product-status-badge"
import {
  type ShopifyStoreLinks,
  shopifyProductAdminUrl,
} from "@/features/products/lib/shopify-admin-url"
import type { ProductResource } from "@/features/products/schema/resource"
import { toastActionError } from "@/lib/errors/safe-action-error-handler"

type ProductShopifyDetailsDialogProps = {
  workspaceId: string
  product: ProductResource
  store: ShopifyStoreLinks
  onOpenChange: (open: boolean) => void
}

/** Read-only view of a Shopify product and its variants. */
export function ProductShopifyDetailsDialog({
  workspaceId,
  product,
  store,
  onOpenChange,
}: ProductShopifyDetailsDialogProps) {
  const t = useTranslations("products.shopify")
  const { execute, result, isPending } = useAction(
    getProductDetailAction.bind(null, workspaceId, product.id),
    { onError: toastActionError(t("loadError")) },
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per opened product
  useEffect(() => {
    execute()
  }, [product.id])

  const detail = result.data
  const variants = detail?.variants ?? []
  const variantCount = variants.length
  const totalUnits = variants.reduce(
    (sum, variant) => sum + (variant.inventoryQuantity ?? 0),
    0,
  )
  const units = variantCount > 0 ? totalUnits : product.inventoryQuantity
  const image = product.images[0]?.url

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("detailsTitle", { name: product.name })}</DialogTitle>
          <DialogDescription>
            {t("detailsSubtitle", { shop: store.shopDomain })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border p-3">
          {image ? (
            // biome-ignore lint/performance/noImgElement: remote Shopify CDN image
            <img
              alt={product.name}
              className="size-14 rounded-md object-cover"
              height={56}
              src={image}
              width={56}
            />
          ) : null}
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{product.name}</span>
              <ProductStatusBadge status={product.status} />
            </div>
            <p className="text-muted-foreground text-sm">
              {t("summaryLine", {
                category: product.category ?? t("uncategorized"),
                units,
                variants: variantCount,
              })}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-sm">
            {t("variantsTitle", { count: variantCount })}
          </h3>
          <div className="max-h-72 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("variantColumn")}</TableHead>
                  <TableHead>{t("skuColumn")}</TableHead>
                  <TableHead>{t("priceColumn")}</TableHead>
                  <TableHead>{t("inventoryColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending ? (
                  <TableRow>
                    <TableCell colSpan={4}>{t("loading")}</TableCell>
                  </TableRow>
                ) : null}
                {variants.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell>
                      {Object.values(variant.combination).join(" / ") ||
                        t("defaultVariant")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {variant.sku ?? product.sku ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {variant.price.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {t("inStock", { count: variant.inventoryQuantity ?? 0 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline">{t("close")}</Button>}
          />
          <a
            className={buttonVariants({ variant: "default" })}
            href={shopifyProductAdminUrl({
              adminUrl: store.adminUrl,
              externalId: product.externalId,
            })}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("editOnShopify")}
            <ExternalLinkIcon />
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
