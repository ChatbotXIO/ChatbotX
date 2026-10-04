import {
  createProductImportTemplate,
  type ProductTemplateLabels,
} from "@chatbotx.io/imports"
import { getTranslations } from "next-intl/server"

export type ProductImportTemplateLocale = "en" | "vi"

export const resolveProductImportTemplateLocale = (
  locale: string,
): ProductImportTemplateLocale => (locale === "vi" ? "vi" : "en")

export const productImportTemplateFileName = (
  locale: ProductImportTemplateLocale,
): string => `product-import-${locale}.xlsx`

export const PRODUCT_IMPORT_TEMPLATE_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/** The XLSX product-import template with example rows, in `locale`. */
export async function buildProductImportTemplate(
  locale: ProductImportTemplateLocale,
): Promise<Buffer> {
  const t = await getTranslations({
    locale,
    namespace: "productImport.template",
  })
  const labels: ProductTemplateLabels = {
    name: t("name"),
    sku: t("sku"),
    price: t("price"),
    discount: t("discount"),
    shortDescription: t("shortDescription"),
    category: t("category"),
    vendor: t("vendor"),
    inventoryQuantity: t("inventoryQuantity"),
    imageUrl: t("imageUrl"),
    productUrl: t("productUrl"),
  }
  return await createProductImportTemplate({
    sheetName: t("sheetName"),
    labels,
    examples: [
      {
        name: t("exampleOne.name"),
        sku: "SKU-001",
        price: 199_000,
        discount: 10,
        shortDescription: t("exampleOne.description"),
        category: t("exampleOne.category"),
        vendor: t("exampleOne.vendor"),
        inventoryQuantity: 25,
        imageUrl: "https://example.com/product-one.jpg",
        productUrl: "https://example.com/products/product-one",
      },
      {
        name: t("exampleTwo.name"),
        sku: "SKU-002",
        price: 99_000,
        discount: 0,
        shortDescription: t("exampleTwo.description"),
        category: t("exampleTwo.category"),
        vendor: t("exampleTwo.vendor"),
        inventoryQuantity: 50,
        imageUrl: "https://example.com/product-two.jpg",
        productUrl: "https://example.com/products/product-two",
      },
    ],
  })
}
