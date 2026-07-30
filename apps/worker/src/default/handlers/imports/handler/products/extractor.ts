import type { ProductImportColumnMap } from "@chatbotx.io/database/partials"
import { cleanText } from "@chatbotx.io/imports/parsers"

export type ProductImportDraft = {
  sourceRow: number
  name: string
  sku?: string
  price?: number
  discount?: number
  shortDescription?: string
  categoryName?: string
  vendor?: string
  inventoryQuantity?: number
  imageUrl?: string
  productUrl?: string
}

export type ProductDraftResult =
  | { ok: true; draft: ProductImportDraft }
  | { ok: false; error: string }

const read = (
  row: Record<string, unknown>,
  column: string | undefined,
): unknown => (column ? row[column] : undefined)

const parseOptionalNumber = (
  value: unknown,
  fieldLabel: string,
): { value?: number; error?: string } => {
  if (value === undefined || value === null || value === "") {
    return {}
  }
  const number =
    typeof value === "number"
      ? value
      : Number(String(value).trim().replace(/,/g, ""))
  return Number.isFinite(number)
    ? { value: number }
    : { error: `${fieldLabel} must be a number` }
}

const parseOptionalHttpUrl = (
  value: unknown,
  fieldLabel: string,
): { value?: string; error?: string } => {
  const text = cleanText(
    typeof value === "number" ? String(value) : value,
    2048,
  )
  if (!text) {
    return {}
  }
  try {
    const url = new URL(text)
    return ["http:", "https:"].includes(url.protocol)
      ? { value: url.toString() }
      : { error: `${fieldLabel} must use HTTP or HTTPS` }
  } catch {
    return { error: `${fieldLabel} is invalid` }
  }
}

export const extractProductDraft = (
  row: Record<string, unknown>,
  columnMap: ProductImportColumnMap,
  sourceRow: number,
): ProductDraftResult => {
  const name = cleanText(read(row, columnMap.name), 255)
  if (!name) {
    return { ok: false, error: "Product name is required" }
  }

  const price = parseOptionalNumber(read(row, columnMap.price), "Price")
  const discount = parseOptionalNumber(
    read(row, columnMap.discount),
    "Discount",
  )
  const inventoryQuantity = parseOptionalNumber(
    read(row, columnMap.inventoryQuantity),
    "Inventory quantity",
  )
  const imageUrl = parseOptionalHttpUrl(
    read(row, columnMap.imageUrl),
    "Image URL",
  )
  const productUrl = parseOptionalHttpUrl(
    read(row, columnMap.productUrl),
    "Product URL",
  )
  const validationError = [
    price.error,
    discount.error,
    inventoryQuantity.error,
    imageUrl.error,
    productUrl.error,
  ].find(Boolean)
  if (validationError) {
    return { ok: false, error: validationError }
  }
  if ((price.value ?? 0) < 0) {
    return { ok: false, error: "Price cannot be negative" }
  }
  if ((discount.value ?? 0) < 0 || (discount.value ?? 0) > 100) {
    return { ok: false, error: "Discount must be between 0 and 100" }
  }
  if (
    inventoryQuantity.value !== undefined &&
    (!Number.isInteger(inventoryQuantity.value) || inventoryQuantity.value < 0)
  ) {
    return {
      ok: false,
      error: "Inventory quantity must be a non-negative integer",
    }
  }

  return {
    ok: true,
    draft: {
      sourceRow,
      name,
      sku: cleanText(read(row, columnMap.sku), 255),
      price: price.value,
      discount: discount.value,
      shortDescription: cleanText(read(row, columnMap.shortDescription), 5000),
      categoryName: cleanText(read(row, columnMap.category), 255),
      vendor: cleanText(read(row, columnMap.vendor), 255),
      inventoryQuantity: inventoryQuantity.value,
      imageUrl: imageUrl.value,
      productUrl: productUrl.value,
    },
  }
}
