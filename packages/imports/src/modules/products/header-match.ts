import {
  type ProductImportColumnMap,
  type ProductImportField,
  productImportFields,
} from "@chatbotx.io/database/partials"

export const normalizeProductHeader = (raw: string): string =>
  raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

const HEADER_CANDIDATES = {
  name: ["name", "productname", "tensanpham"],
  sku: ["sku", "code", "masanpham"],
  price: ["price", "sellingprice", "giaban"],
  discount: ["discount", "discountpercentage", "giamgia"],
  shortDescription: ["shortdescription", "description", "motangan"],
  category: ["category", "productcategory", "danhmuc"],
  vendor: ["vendor", "brand", "thuonghieu"],
  inventoryQuantity: ["inventoryquantity", "quantity", "soluong"],
  imageUrl: ["imageurl", "image", "hinhanh"],
  productUrl: ["producturl", "url", "linksanpham"],
} as const satisfies Record<ProductImportField, readonly string[]>

const normalizedCandidates = Object.fromEntries(
  productImportFields.options.map((field) => [
    field,
    new Set(HEADER_CANDIDATES[field].map(normalizeProductHeader)),
  ]),
) as Record<ProductImportField, Set<string>>

export const matchProductImportHeaders = (
  headers: readonly string[],
): Partial<ProductImportColumnMap> => {
  const matchedColumns = new Set<string>()
  const result: Partial<ProductImportColumnMap> = {}

  for (const field of productImportFields.options) {
    const match = headers.find(
      (header) =>
        !matchedColumns.has(header) &&
        normalizedCandidates[field].has(normalizeProductHeader(header)),
    )
    if (match) {
      result[field] = match
      matchedColumns.add(match)
    }
  }
  return result
}
