import type { ProductImageInput } from "../../product/service"
import {
  type ProductWriteData,
  productAddonService,
  productService,
} from "../../product/service"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

type TemplateProductAddon = {
  name: string
  maxSelections: number
  addonProductIds: string[]
}

type TemplateProductVariant = {
  combination: Record<string, string>
  price: number
  isEnabled: boolean
}

type TemplateProductVariantOption = {
  name: string
  values: string[]
  position: number
}

type TemplateProductEntry = Omit<ProductWriteData, "workspaceId"> & {
  sourceId: string
  images?: ProductImageInput[]
  variantOptions?: TemplateProductVariantOption[]
  variants?: TemplateProductVariant[]
  addons?: TemplateProductAddon[]
}

/**
 * Products insert without their addons — `ProductAddon.addonProductIds` can
 * point at a sibling product from this same template that has not been
 * created yet (a within-category cyclic reference, the same shape as
 * cross-flow jumps in `flows.ts`). Category/subcategory refs are resolved
 * eagerly since `productCategories` is a Phase-R manifest, always available
 * before Phase 1 starts.
 */
export const productsAdapter: ResourceAdapter = {
  category: "products",
  providesKinds: ["product"],
  consumesKinds: ["productCategory", "product"],
  deferredKinds: ["product"],

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ): Promise<PatchTask[]> {
    if (!ctx.idMaps.product) {
      ctx.idMaps.product = new Map()
    }
    const productIdMap = ctx.idMaps.product
    const pendingAddonsByProductId = new Map<string, TemplateProductAddon[]>()

    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as TemplateProductEntry
      const categoryId = resolveCategoryReference(ctx, entry.categoryId)
      const subcategoryId = resolveCategoryReference(ctx, entry.subcategoryId)

      const product = await productService.create({
        data: {
          ...entry,
          workspaceId: ctx.workspaceId,
          categoryId,
          subcategoryId,
        },
        tx: ctx.tx,
      })

      productIdMap.set(entry.sourceId, product.id)
      if (entry.addons && entry.addons.length > 0) {
        pendingAddonsByProductId.set(product.id, entry.addons)
      }
      ctx.track({
        category: "products",
        resourceKind: "product",
        resourceId: product.id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return [
      {
        category: "products",
        apply: async (patchCtx) => {
          for (const [productId, addons] of pendingAddonsByProductId) {
            const resolvedAddons = addons.flatMap((addon) => {
              const addonProductIds = addon.addonProductIds.flatMap(
                (sourceId) => {
                  const targetId = patchCtx.idMaps.product?.get(sourceId)
                  if (!targetId) {
                    patchCtx.warn({
                      category: "products",
                      entityKind: "product",
                      path: `products.${productId}.addons.addonProductIds`,
                      value: sourceId,
                    })
                    return []
                  }
                  return [targetId]
                },
              )
              return [{ ...addon, addonProductIds }]
            })
            await productAddonService.createBulk({
              productId,
              addons: resolvedAddons,
              tx: patchCtx.tx,
            })
          }
        },
      },
    ]
  },
}

const resolveCategoryReference = (
  ctx: TemplateInstallContext,
  sourceId: string | null | undefined,
): string | null => {
  if (!sourceId) {
    return null
  }
  const targetId = ctx.idMaps.productCategory?.get(sourceId)
  if (!targetId) {
    ctx.warn({
      category: "products",
      entityKind: "productCategory",
      path: "products.categoryId",
      value: sourceId,
    })
    return null
  }
  return targetId
}
