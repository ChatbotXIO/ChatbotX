import { productCategoryService, productService } from "@chatbotx.io/business"
import {
  type ProductImportMeta,
  productImportMetaSchema,
} from "@chatbotx.io/database/partials"
import type {
  BatchResult,
  ImportPrepareResult,
  ImportRow,
  ImportTypeHandler,
} from "../../base-import"
import { extractProductDraft, type ProductImportDraft } from "./extractor"

type ProductImportDeps = {
  categoryIdsByName: Map<string, string>
}

const normalizeCategoryName = (name: string): string =>
  name.trim().toLowerCase()

const prepareProducts = async ({
  row,
}: {
  row: ImportRow
  meta: ProductImportMeta
}): Promise<ImportPrepareResult<ProductImportDeps>> => {
  const categories = await productCategoryService.listOptions(row.workspaceId)
  return {
    ok: true,
    deps: {
      categoryIdsByName: new Map(
        categories.map((category) => [
          normalizeCategoryName(category.name),
          category.id,
        ]),
      ),
    },
  }
}

const processProductBatch = async (
  deps: ProductImportDeps,
  rows: ProductImportDraft[],
  context: { row: ImportRow; meta: ProductImportMeta },
): Promise<BatchResult> => {
  const categoryNames = Array.from(
    new Set(
      rows
        .flatMap((row) => row.categoryName ?? [])
        .filter(
          (name) => !deps.categoryIdsByName.has(normalizeCategoryName(name)),
        ),
    ),
  )
  const resolvedCategories = await productCategoryService.resolveByNames({
    workspaceId: context.row.workspaceId,
    names: categoryNames,
    createMissing: context.meta.createMissingCategories,
  })
  for (const [name, id] of resolvedCategories) {
    deps.categoryIdsByName.set(name, id)
  }

  const errors: Array<{ row: number; reason: string }> = []
  const validRows = rows.filter((row) => {
    if (
      row.categoryName &&
      !deps.categoryIdsByName.has(normalizeCategoryName(row.categoryName))
    ) {
      errors.push({
        row: row.sourceRow,
        reason: `Unknown category: ${row.categoryName}`,
      })
      return false
    }
    return true
  })

  try {
    const inserted = await productService.createFromImport({
      workspaceId: context.row.workspaceId,
      products: validRows.map((row) => ({
        name: row.name,
        sku: row.sku,
        price: row.price,
        discount: row.discount,
        shortDescription: row.shortDescription,
        categoryId: row.categoryName
          ? deps.categoryIdsByName.get(normalizeCategoryName(row.categoryName))
          : undefined,
        vendor: row.vendor,
        inventoryQuantity: row.inventoryQuantity,
        images: row.imageUrl ? [{ url: row.imageUrl, type: "link" }] : [],
        productUrl: row.productUrl,
      })),
    })
    return {
      success: inserted.length,
      failed: rows.length - inserted.length,
      errors,
    }
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Product batch insert failed"
    return {
      success: 0,
      failed: rows.length,
      errors: rows.map((row) => ({ row: row.sourceRow, reason })),
    }
  }
}

export const productsImportHandler: ImportTypeHandler<
  ProductImportMeta,
  ProductImportDeps,
  ProductImportDraft
> = {
  type: "products",
  parseMeta: (raw) => productImportMetaSchema.parse(raw),
  prepare: prepareProducts,
  processRow: (_deps, rawRow, meta, context) => {
    const result = extractProductDraft(
      rawRow,
      meta.columnMap,
      context.rowNumber,
    )
    return result.ok ? result.draft : { error: result.error }
  },
  processBatch: processProductBatch,
}
