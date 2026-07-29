import { db } from "@chatbotx.io/database/client"
import {
  metaCatalogItemRepository,
  productRepository,
} from "@chatbotx.io/database/repositories"
import { productCategoryService } from "../product-category"

export type MetaCatalogImportProduct = {
  retailerId: string
  name: string
  sku: string
  price: number
  discount: number
  currency?: string
  productUrl?: string
  shortDescription?: string
  categoryName?: string
  vendor?: string
  inventoryQuantity: number
  inventoryPolicy: "dont_track" | "track"
  images: Array<{ url: string; type: "link" }>
  isActive: boolean
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
    const existingLinks = await metaCatalogItemRepository.findByRetailerIds({
      integrationMetaCatalogId: input.integrationMetaCatalogId,
      catalogId: input.catalogId,
      retailerIds: uniqueProducts.map((product) => product.retailerId),
    })
    const existingRetailerIds = new Set(
      existingLinks.map((link) => link.retailerId),
    )
    const missingProducts = uniqueProducts.filter(
      (product) => !existingRetailerIds.has(product.retailerId),
    )
    if (missingProducts.length === 0) {
      return { imported: 0, existing: input.products.length }
    }

    const categoryIdsByName = await productCategoryService.resolveByNames({
      workspaceId: input.workspaceId,
      names: missingProducts.flatMap((product) => product.categoryName ?? []),
      createMissing: true,
    })

    const imported = await db.transaction(async (tx) => {
      const rows = await productRepository.createFromImport(
        {
          workspaceId: input.workspaceId,
          products: missingProducts.map((product) => ({
            name: product.name,
            sku: product.sku,
            price: product.price,
            discount: product.discount,
            currency: product.currency,
            productUrl: product.productUrl,
            shortDescription: product.shortDescription,
            categoryId: product.categoryName
              ? categoryIdsByName.get(product.categoryName.trim().toLowerCase())
              : undefined,
            vendor: product.vendor,
            inventoryQuantity: product.inventoryQuantity,
            inventoryPolicy: product.inventoryPolicy,
            images: product.images,
            isActive: product.isActive,
          })),
        },
        tx,
      )
      await metaCatalogItemRepository.linkImported(
        {
          integrationMetaCatalogId: input.integrationMetaCatalogId,
          catalogId: input.catalogId,
          items: rows.map((row, index) => {
            const source = missingProducts[index]
            if (!source) {
              throw new Error("Meta Catalog import result order is invalid")
            }
            return {
              productId: row.id,
              retailerId: source.retailerId,
            }
          }),
        },
        tx,
      )
      return rows
    })

    return {
      imported: imported.length,
      existing: existingRetailerIds.size + duplicateCount,
    }
  }
}

export const metaCatalogImportService = new MetaCatalogImportService()
