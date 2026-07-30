import { db } from "@chatbotx.io/database/client"
import {
  metaCatalogItemRepository,
  productRepository,
} from "@chatbotx.io/database/repositories"
import {
  getProductCategoryPathKey,
  productCategoryService,
} from "../product-category"

export type MetaCatalogImportProduct = {
  retailerId: string
  name: string
  sku: string
  price?: number
  discount?: number
  currency?: string
  productUrl?: string | null
  shortDescription?: string | null
  longDescription?: string | null
  categoryName?: string | null
  subcategoryName?: string | null
  tags?: string[]
  vendor?: string | null
  inventoryQuantity?: number
  inventoryPolicy?: "dont_track" | "track"
  allowOutOfStockPurchase?: boolean
  images?: Array<{ url: string; type: "link" }>
  isActive?: boolean
}

const toProductValues = (
  product: MetaCatalogImportProduct,
  categoryPaths: Map<
    string,
    { categoryId: string; subcategoryId: string | null }
  >,
  includeSku: boolean,
) => {
  let categoryPath:
    | { categoryId: string | null; subcategoryId: string | null }
    | undefined
  if (product.categoryName === null) {
    categoryPath = { categoryId: null, subcategoryId: null }
  } else if (product.categoryName) {
    categoryPath = categoryPaths.get(
      getProductCategoryPathKey({
        categoryName: product.categoryName,
        subcategoryName: product.subcategoryName ?? undefined,
      }),
    )
  }
  return {
    name: product.name,
    ...(includeSku ? { sku: product.sku } : {}),
    ...(product.price === undefined ? {} : { price: product.price }),
    ...(product.discount === undefined ? {} : { discount: product.discount }),
    ...(product.currency ? { currency: product.currency } : {}),
    ...(product.productUrl === undefined
      ? {}
      : { productUrl: product.productUrl }),
    ...(product.shortDescription === undefined
      ? {}
      : { shortDescription: product.shortDescription }),
    ...(product.longDescription === undefined
      ? {}
      : { longDescription: product.longDescription }),
    ...(categoryPath ?? {}),
    ...(product.tags === undefined ? {} : { tags: product.tags }),
    ...(product.vendor === undefined ? {} : { vendor: product.vendor }),
    ...(product.inventoryQuantity === undefined
      ? {}
      : { inventoryQuantity: product.inventoryQuantity }),
    ...(product.inventoryPolicy === undefined
      ? {}
      : { inventoryPolicy: product.inventoryPolicy }),
    ...(product.allowOutOfStockPurchase === undefined
      ? {}
      : { allowOutOfStockPurchase: product.allowOutOfStockPurchase }),
    ...(product.images === undefined ? {} : { images: product.images }),
    ...(product.isActive === undefined ? {} : { isActive: product.isActive }),
  }
}

class MetaCatalogImportService {
  async importPage(input: {
    workspaceId: string
    integrationMetaCatalogId: string
    /** The catalog these products were read from — links are scoped to it. */
    catalogId: string
    products: MetaCatalogImportProduct[]
  }): Promise<{ imported: number; existing: number }> {
    const uniqueProducts = Array.from(
      new Map(
        input.products.map((product) => [product.retailerId, product]),
      ).values(),
    )
    const duplicateCount = input.products.length - uniqueProducts.length
    if (uniqueProducts.length === 0) {
      return { imported: 0, existing: 0 }
    }

    return await db.transaction(async (tx) => {
      const scope = {
        integrationMetaCatalogId: input.integrationMetaCatalogId,
        catalogId: input.catalogId,
      }
      const retailerIds = uniqueProducts.map((product) => product.retailerId)
      // `linkImported` also locks internally before its own write, but that's
      // too late here: this service reads (`findByRetailerIds`) and decides
      // create-vs-update before ever calling it, so the lock must already be
      // held going into that read or two import pages can both observe
      // "missing" and create separate local products for the same retailer
      // ID. The lock is re-entrant per transaction, so `linkImported`
      // reacquiring it later is a safe no-op, not a second lock.
      await metaCatalogItemRepository.lockCatalogAssignments(scope, tx)
      const existingLinks = await metaCatalogItemRepository.findByRetailerIds(
        { ...scope, retailerIds },
        tx,
      )
      const existingLinkByRetailerId = new Map(
        existingLinks.map((link) => [link.retailerId, link]),
      )
      const unlinkedProducts = uniqueProducts.filter(
        (product) => !existingLinkByRetailerId.has(product.retailerId),
      )
      const identifierMatches = await productRepository.findByImportIdentifiers(
        {
          workspaceId: input.workspaceId,
          retailerIds: unlinkedProducts.map((product) => product.retailerId),
        },
        tx,
      )
      const productById = new Map(
        identifierMatches.map((product) => [product.id, product]),
      )
      const productsBySku = new Map<string, typeof identifierMatches>()
      for (const product of identifierMatches) {
        const sku = product.sku?.trim()
        if (sku) {
          productsBySku.set(sku, [...(productsBySku.get(sku) ?? []), product])
        }
      }
      const matchedProducts = unlinkedProducts.flatMap((product) => {
        const exactIdMatch = productById.get(product.retailerId)
        const skuMatches = productsBySku.get(product.retailerId) ?? []
        const candidateProductIds = new Set([
          ...(exactIdMatch ? [exactIdMatch.id] : []),
          ...skuMatches.map((match) => match.id),
        ])
        if (candidateProductIds.size > 1) {
          throw new Error(
            `Meta Catalog retailer ID "${product.retailerId}" matches multiple product identifiers`,
          )
        }
        const productId = candidateProductIds.values().next().value
        return productId ? [{ product, productId }] : []
      })
      const matchedRetailerIds = new Set(
        matchedProducts.map(({ product }) => product.retailerId),
      )
      const missingProducts = unlinkedProducts.filter(
        (product) => !matchedRetailerIds.has(product.retailerId),
      )
      const existingProducts = uniqueProducts.flatMap((product) => {
        const link = existingLinkByRetailerId.get(product.retailerId)
        if (link) {
          return [{ product, productId: link.productId }]
        }
        const match = matchedProducts.find(
          (candidate) => candidate.product.retailerId === product.retailerId,
        )
        return match ? [match] : []
      })
      const retailerIdByProductId = new Map<string, string>()
      for (const { product, productId } of existingProducts) {
        const assignedRetailerId = retailerIdByProductId.get(productId)
        if (assignedRetailerId && assignedRetailerId !== product.retailerId) {
          throw new Error(
            `Meta Catalog items "${assignedRetailerId}" and "${product.retailerId}" match the same product`,
          )
        }
        retailerIdByProductId.set(productId, product.retailerId)
      }
      const categoryPaths = await productCategoryService.resolvePaths({
        workspaceId: input.workspaceId,
        paths: uniqueProducts.flatMap((product) =>
          typeof product.categoryName === "string"
            ? [
                {
                  categoryName: product.categoryName,
                  subcategoryName: product.subcategoryName ?? undefined,
                },
              ]
            : [],
        ),
        createMissing: true,
        tx,
      })
      for (const { product, productId } of existingProducts) {
        const updated = await productRepository.update(
          {
            workspaceId: input.workspaceId,
            productId,
            values: toProductValues(product, categoryPaths, false),
          },
          tx,
        )
        if (!updated) {
          throw new Error(
            `Meta Catalog retailer ID "${product.retailerId}" points to a missing product`,
          )
        }
      }

      const rows =
        missingProducts.length > 0
          ? await productRepository.createFromImport(
              {
                workspaceId: input.workspaceId,
                products: missingProducts.map((product) =>
                  toProductValues(product, categoryPaths, true),
                ),
              },
              tx,
            )
          : []
      await metaCatalogItemRepository.linkImported(
        {
          ...scope,
          items: [
            ...matchedProducts.map(({ product, productId }) => ({
              productId,
              retailerId: product.retailerId,
            })),
            ...rows.map((row, index) => {
              const source = missingProducts[index]
              if (!source) {
                throw new Error("Meta Catalog import result order is invalid")
              }
              return {
                productId: row.id,
                retailerId: source.retailerId,
              }
            }),
          ],
        },
        tx,
      )
      return {
        imported: rows.length,
        existing: existingProducts.length + duplicateCount,
      }
    })
  }
}

export const metaCatalogImportService = new MetaCatalogImportService()
